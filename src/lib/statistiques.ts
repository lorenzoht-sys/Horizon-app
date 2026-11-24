// Calculs de la page « Mes stats » (StatsPage), sortis de la page le 2026-11-24 pour être testés.
//
// Pensée pour l'enseignant APA indépendant qui travaille aussi pour des structures (Lorenzo,
// 2026-11-24) : ce qui rentre, ce qui reste dû, le temps passé, ce que rapporte une heure, ce que
// coûtent les annulations, d'où vient le chiffre d'affaires et ce que représente chaque structure.
//
// Corrige aussi l'ancienne page : elle comptait les séances à venir comme des annulations, calculait
// des progressions en % sur des mesures qui peuvent être négatives (souplesse), inventait un
// kilométrage et une projection, et affichait un « CA du mois » presque toujours nul (le CA ne compte
// que les factures validées, et une facture ne se valide qu'à partir du 1er du mois suivant : voir
// 20261011100000_facturation_progressive.sql). Le mois en cours vit dans les BROUILLONS.
//
// Toutes les dates sont des chaînes civiles « AAAA-MM-JJ » : pas d'objet Date local, pour ne pas
// décaler d'un jour selon le fuseau.

import type { Bilan, Contrat, CoursCollectif, Participant, RaisonAnnulation, Seance, TarifContrat } from '../types';
import { distanceTm6 } from './tm6';
import { LABEL_RAISON_ANNULATION } from './agendaCommun';
import { trouverTarifApplicable, totalFactureSeance } from './tarifsContrats';

type SeanceStat = Pick<Seance, 'participantId' | 'date' | 'statut'> & Partial<Pick<Seance, 'dureeMinutes' | 'contratId' | 'motifAnnulation'>>;
type CoursStat = Pick<CoursCollectif, 'date' | 'statut' | 'dureeMinutes'> & Partial<Pick<CoursCollectif, 'structureId'>>;

// ─── Dates ───────────────────────────────────────────────────────────────────

function versUtc(jour: string): number {
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, j);
}

export function ajouterJours(jour: string, n: number): string {
  return new Date(versUtc(jour) + n * 86400000).toISOString().slice(0, 10);
}

export function ecartJours(de: string, a: string): number {
  return Math.round((versUtc(a) - versUtc(de)) / 86400000);
}

/** Lundi de la semaine du jour donné. */
export function lundiDe(jour: string): string {
  const dow = new Date(versUtc(jour)).getUTCDay(); // 0 = dimanche
  return ajouterJours(jour, -((dow + 6) % 7));
}

/** « AAAA-MM » décalé de n mois. */
export function moisDecale(cle: string, n: number): string {
  const [a, m] = cle.split('-').map(Number);
  const i = a * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** Les `n` derniers mois « AAAA-MM », le mois de `aujourdhui` compris, du plus ancien au plus récent. */
export function derniersMois(aujourdhui: string, n = 12): string[] {
  const cle = aujourdhui.slice(0, 7);
  return Array.from({ length: n }, (_, i) => moisDecale(cle, i - (n - 1)));
}

function dureeSeance(s: { dureeMinutes?: number }): number {
  return typeof s.dureeMinutes === 'number' && s.dureeMinutes > 0 ? s.dureeMinutes : 60;
}

/** « 12 h », « 12 h 30 » */
export function formaterHeures(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

// ─── Présence ────────────────────────────────────────────────────────────────

/** Taux de présence : réalisées / (réalisées + annulées). Null s'il n'y a rien à compter. */
export function taux(realisees: number, annulees: number): number | null {
  const total = realisees + annulees;
  return total > 0 ? Math.round((realisees / total) * 100) : null;
}

export interface Presence {
  realisees: number;
  annulees: number;
  /** Séances passées restées « planifiées » : ni réalisées ni annulées, donc non comptées. */
  nonPointees: number;
  taux: number | null;
}

/**
 * Présence sur les `jours` derniers jours, aujourd'hui exclu : seules les séances passées
 * comptent. Les reportées ne comptent pas (la séance a lieu à une autre date).
 */
export function presenceRecente(seances: readonly SeanceStat[], aujourdhui: string, jours = 30): Presence {
  const debut = ajouterJours(aujourdhui, -jours);
  const passees = seances.filter(s => s.date >= debut && s.date < aujourdhui);
  const realisees = passees.filter(s => s.statut === 'realisee').length;
  const annulees = passees.filter(s => s.statut === 'annulee').length;
  const nonPointees = passees.filter(s => s.statut === 'planifiee').length;
  return { realisees, annulees, nonPointees, taux: taux(realisees, annulees) };
}

// ─── Temps de travail ────────────────────────────────────────────────────────

/** Minutes de séance réalisées (séances individuelles et cours collectifs) entre deux dates incluses. */
export function minutesRealisees(seances: readonly SeanceStat[], cours: readonly CoursStat[], debut: string, fin: string): number {
  const ind = seances.filter(s => s.statut === 'realisee' && s.date >= debut && s.date <= fin).reduce((t, s) => t + dureeSeance(s), 0);
  const col = cours.filter(c => c.statut === 'realise' && c.date >= debut && c.date <= fin).reduce((t, c) => t + dureeSeance(c), 0);
  return ind + col;
}

/**
 * Heures du mois en cours jusqu'à aujourd'hui, celles du mois précédent jusqu'au même quantième
 * (borné à la fin du mois précédent) pour comparer à date égale, et ce qui reste prévu ce mois-ci.
 */
export function activiteMoisADate(seances: readonly SeanceStat[], cours: readonly CoursStat[], aujourdhui: string): {
  minutes: number; minutesMoisPrecedent: number; minutesPrevues: number; seancesPrevues: number;
} {
  const j = Number(aujourdhui.slice(8, 10));
  const prec = moisDecale(aujourdhui.slice(0, 7), -1);
  const [pa, pm] = prec.split('-').map(Number);
  const dernierJourPrec = new Date(Date.UTC(pa, pm, 0)).getUTCDate();
  const finMois = `${aujourdhui.slice(0, 8)}31`;
  const prevuesInd = seances.filter(s => s.statut === 'planifiee' && s.date > aujourdhui && s.date <= finMois);
  const prevuesCol = cours.filter(c => c.statut === 'planifie' && c.date > aujourdhui && c.date <= finMois);
  return {
    minutes: minutesRealisees(seances, cours, `${aujourdhui.slice(0, 8)}01`, aujourdhui),
    minutesMoisPrecedent: minutesRealisees(seances, cours, `${prec}-01`, `${prec}-${String(Math.min(j, dernierJourPrec)).padStart(2, '0')}`),
    minutesPrevues: [...prevuesInd, ...prevuesCol].reduce((t, s) => t + dureeSeance(s), 0),
    seancesPrevues: prevuesInd.length + prevuesCol.length,
  };
}

export interface Semaine {
  /** Lundi de la semaine. */
  debut: string;
  /** « 17/11 » */
  libelle: string;
  realisees: number;
  annulees: number;
  /** Heures réalisées (séances et cours collectifs), arrondies au quart d'heure. */
  heures: number;
  heuresAnnulees: number;
}

/** Les `n` dernières semaines (lundi → dimanche), la semaine en cours comprise, de la plus ancienne à la plus récente. */
export function semaines(seances: readonly SeanceStat[], cours: readonly CoursStat[], aujourdhui: string, n = 12): Semaine[] {
  const lundi = lundiDe(aujourdhui);
  const quart = (min: number) => Math.round((min / 60) * 4) / 4;
  return Array.from({ length: n }, (_, i) => {
    const debut = ajouterJours(lundi, -7 * (n - 1 - i));
    const fin = ajouterJours(debut, 6);
    const ind = seances.filter(s => s.date >= debut && s.date <= fin);
    const col = cours.filter(c => c.date >= debut && c.date <= fin);
    const annuleesInd = ind.filter(s => s.statut === 'annulee');
    const annuleesCol = col.filter(c => c.statut === 'annule');
    return {
      debut,
      libelle: `${debut.slice(8, 10)}/${debut.slice(5, 7)}`,
      realisees: ind.filter(s => s.statut === 'realisee').length + col.filter(c => c.statut === 'realise').length,
      annulees: annuleesInd.length + annuleesCol.length,
      heures: quart(minutesRealisees(ind, col, debut, fin)),
      heuresAnnulees: quart([...annuleesInd, ...annuleesCol].reduce((t, s) => t + dureeSeance(s), 0)),
    };
  });
}

// ─── Argent ──────────────────────────────────────────────────────────────────

/** Ligne de chiffre_affaires_mensuel (factures émises au mois de la prestation, HT, + CA externe). */
export interface LigneCAStat { mois: string; participantId: string; horizon: number; externe: number }
/** Brouillon de facture : le mois en cours se construit au fil des séances réalisées. */
export interface BrouillonStat { periode: string; totalHt: number }

export interface MoisCA {
  /** « AAAA-MM » */
  mois: string;
  /** Factures émises (HT, avoirs déduits) + CA externe saisi. */
  facture: number;
  /** Brouillons pas encore validés : séances réalisées déjà valorisées au tarif du contrat. */
  enPreparation: number;
  total: number;
}

/** CA HT par mois, facturé et en préparation, sur les mois demandés. */
export function caParMois(lignes: readonly LigneCAStat[], brouillons: readonly BrouillonStat[], mois: readonly string[]): MoisCA[] {
  return mois.map(m => {
    const facture = lignes.filter(l => l.mois.startsWith(m)).reduce((t, l) => t + l.horizon + l.externe, 0);
    const enPreparation = brouillons.filter(b => b.periode.startsWith(m)).reduce((t, b) => t + b.totalHt, 0);
    return { mois: m, facture, enPreparation, total: facture + enPreparation };
  });
}

type FactureStat = {
  id: string; type: 'facture' | 'avoir'; statut: string; total: number; paye: number;
  dateEmission: string; datePaiement: string | null; factureOrigineId: string | null;
};

export interface Encaissements {
  /** Reste dû TTC sur les factures émises non soldées, avoirs déduits. */
  resteDu: number;
  nbAttente: number;
  enRetard: number;
  nbEnRetard: number;
  /** Délai moyen entre émission et paiement sur les 12 derniers mois, en jours ; null sans paiement. */
  delaiMoyen: number | null;
}

export function encaissements(factures: readonly FactureStat[], aujourdhui: string): Encaissements {
  const avoirs = (id: string) => factures.filter(a => a.type === 'avoir' && a.factureOrigineId === id && a.statut !== 'annulee')
    .reduce((t, a) => t + a.total, 0);
  let resteDu = 0, nbAttente = 0, enRetard = 0, nbEnRetard = 0;
  for (const f of factures) {
    if (f.type !== 'facture' || !['validee', 'envoyee', 'en_retard'].includes(f.statut)) continue;
    const reste = Math.max(0, Math.round((f.total - avoirs(f.id) - f.paye) * 100) / 100);
    if (reste <= 0) continue;
    resteDu += reste; nbAttente++;
    if (f.statut === 'en_retard') { enRetard += reste; nbEnRetard++; }
  }
  const depuis = ajouterJours(aujourdhui, -365);
  const delais = factures
    .filter(f => f.type === 'facture' && f.statut === 'payee' && f.datePaiement && f.datePaiement >= depuis)
    .map(f => Math.max(0, ecartJours(f.dateEmission, f.datePaiement!)));
  return {
    resteDu: Math.round(resteDu * 100) / 100, nbAttente,
    enRetard: Math.round(enRetard * 100) / 100, nbEnRetard,
    delaiMoyen: delais.length > 0 ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
  };
}

/**
 * Valeur des séances données au tarif applicable de leur contrat (séance + déplacement), comme les
 * brouillons. Sert à estimer la fin du mois (séances prévues) et le manque à gagner des annulations.
 * Une séance sans contrat ou sans tarif applicable est comptée à part, jamais inventée.
 */
export function valeurSeances(seances: readonly SeanceStat[], tarifs: Readonly<Record<string, TarifContrat[]>>): {
  montant: number; valorisees: number; sansTarif: number;
} {
  let montant = 0, valorisees = 0, sansTarif = 0;
  for (const s of seances) {
    const versions = s.contratId ? tarifs[s.contratId] : undefined;
    const t = versions ? trouverTarifApplicable(versions, s.date) : null;
    if (!t) { sansTarif++; continue; }
    montant += totalFactureSeance(t); valorisees++;
  }
  return { montant: Math.round(montant * 100) / 100, valorisees, sansTarif };
}

// ─── Annulations ─────────────────────────────────────────────────────────────

export interface Annulations {
  annulees: number;
  /** Séances passées comptées (réalisées + annulées). */
  total: number;
  minutesPerdues: number;
  motifs: { motif: RaisonAnnulation | 'non_renseigne'; libelle: string; n: number }[];
}

/** Annulations des `jours` derniers jours (séances individuelles passées), par motif. */
export function annulations(seances: readonly SeanceStat[], aujourdhui: string, jours = 90): Annulations {
  const debut = ajouterJours(aujourdhui, -jours);
  const passees = seances.filter(s => s.date >= debut && s.date < aujourdhui && (s.statut === 'realisee' || s.statut === 'annulee'));
  const annul = passees.filter(s => s.statut === 'annulee');
  const compte = new Map<RaisonAnnulation | 'non_renseigne', number>();
  for (const s of annul) {
    const m = s.motifAnnulation ?? 'non_renseigne';
    compte.set(m, (compte.get(m) ?? 0) + 1);
  }
  return {
    annulees: annul.length,
    total: passees.length,
    minutesPerdues: annul.reduce((t, s) => t + dureeSeance(s), 0),
    motifs: [...compte.entries()]
      .map(([motif, n]) => ({ motif, n, libelle: motif === 'non_renseigne' ? 'Motif non renseigné' : LABEL_RAISON_ANNULATION[motif] }))
      .sort((a, b) => b.n - a.n),
  };
}

// ─── D'où vient le chiffre d'affaires ────────────────────────────────────────

export interface SourceCA {
  cle: string;
  libelle: string;
  montant: number;
  /** Part du total, en %. */
  part: number;
  beneficiaires: number;
}

/**
 * CA facturé sur la période par origine des bénéficiaires : chaque structure, et les particuliers
 * (bénéficiaires sans structure). Mesure la dépendance à une structure.
 */
export function sourcesCA(
  lignes: readonly LigneCAStat[],
  participants: readonly Pick<Participant, 'id' | 'structureId'>[],
  structures: readonly { id: string; nom: string }[],
): SourceCA[] {
  const structureDe = new Map(participants.map(p => [p.id, p.structureId ?? null]));
  const nomStructure = new Map(structures.map(s => [s.id, s.nom]));
  const parSource = new Map<string, { montant: number; benef: Set<string> }>();
  for (const l of lignes) {
    const montant = l.horizon + l.externe;
    if (montant === 0) continue;
    const sid = structureDe.get(l.participantId) ?? null;
    const cle = sid && nomStructure.has(sid) ? sid : 'particuliers';
    const s = parSource.get(cle) ?? { montant: 0, benef: new Set<string>() };
    s.montant += montant; s.benef.add(l.participantId);
    parSource.set(cle, s);
  }
  const total = [...parSource.values()].reduce((t, s) => t + s.montant, 0);
  if (total <= 0) return [];
  return [...parSource.entries()]
    .map(([cle, s]) => ({
      cle, libelle: cle === 'particuliers' ? 'Particuliers' : nomStructure.get(cle)!,
      montant: Math.round(s.montant * 100) / 100, part: Math.round((s.montant / total) * 100), beneficiaires: s.benef.size,
    }))
    .sort((a, b) => b.montant - a.montant);
}

/** Part du CA apportée par le plus gros bénéficiaire (particulier ou bénéficiaire de structure). */
export function partPremierBeneficiaire(lignes: readonly LigneCAStat[]): number | null {
  const par = new Map<string, number>();
  for (const l of lignes) par.set(l.participantId, (par.get(l.participantId) ?? 0) + l.horizon + l.externe);
  const total = [...par.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  return Math.round((Math.max(...par.values()) / total) * 100);
}

// ─── Portefeuille ────────────────────────────────────────────────────────────

export interface Portefeuille {
  /** Bénéficiaires avec un contrat actif. */
  actifs: number;
  /** Premier contrat commencé dans les `jours` derniers jours. */
  arrivees: number;
  /** Plus aucun contrat actif, suspendu ou à venir, dernier contrat terminé dans les `jours` derniers jours. */
  departs: number;
  /** Ancienneté moyenne des bénéficiaires actifs depuis leur premier contrat, en mois. */
  ancienneteMois: number | null;
}

export function portefeuille(
  contrats: readonly Pick<Contrat, 'participantId' | 'statut' | 'dateDebut' | 'dateFin'>[],
  aujourdhui: string,
  jours = 90,
): Portefeuille {
  const debutFenetre = ajouterJours(aujourdhui, -jours);
  const parPersonne = new Map<string, Pick<Contrat, 'statut' | 'dateDebut' | 'dateFin'>[]>();
  for (const c of contrats) {
    const l = parPersonne.get(c.participantId) ?? [];
    l.push(c); parPersonne.set(c.participantId, l);
  }
  let actifs = 0, arrivees = 0, departs = 0;
  const anciennetes: number[] = [];
  for (const liste of parPersonne.values()) {
    const premier = liste.map(c => c.dateDebut).sort()[0];
    const enCours = liste.some(c => c.statut === 'actif' || c.statut === 'suspendu' || c.statut === 'a_venir');
    if (liste.some(c => c.statut === 'actif')) {
      actifs++;
      if (premier) anciennetes.push(ecartJours(premier, aujourdhui) / 30.44);
    }
    if (premier && premier >= debutFenetre && premier <= aujourdhui) arrivees++;
    if (!enCours) {
      const derniereFin = liste.map(c => c.dateFin).filter(Boolean).sort().at(-1);
      if (derniereFin && derniereFin >= debutFenetre && derniereFin <= aujourdhui) departs++;
    }
  }
  return {
    actifs, arrivees, departs,
    ancienneteMois: anciennetes.length > 0 ? Math.round(anciennetes.reduce((a, b) => a + b, 0) / anciennetes.length) : null,
  };
}

// ─── Par structure ───────────────────────────────────────────────────────────

export interface LigneStructure {
  cle: string;
  libelle: string;
  beneficiaires: number;
  /** Minutes réalisées ce mois (séances des bénéficiaires + cours collectifs de la structure). */
  minutesMois: number;
  coursMois: number;
  presence: number | null;
  ca12Mois: number;
}

/**
 * Une ligne par structure (et une pour les particuliers) : de quoi rendre compte à une structure
 * de ce qui a été fait pour elle. Présence sur 90 jours, CA facturé sur la période des `lignes`.
 */
export function parStructure(args: {
  structures: readonly { id: string; nom: string }[];
  suivis: readonly Pick<Participant, 'id' | 'structureId'>[];
  seances: readonly SeanceStat[];
  cours: readonly CoursStat[];
  lignes: readonly LigneCAStat[];
  participants: readonly Pick<Participant, 'id' | 'structureId'>[];
  aujourdhui: string;
}): LigneStructure[] {
  const { structures, suivis, seances, cours, lignes, participants, aujourdhui } = args;
  const debutMois = `${aujourdhui.slice(0, 8)}01`;
  const structureDe = new Map(participants.map(p => [p.id, p.structureId ?? null]));
  const groupes = [...structures.map(s => ({ cle: s.id, libelle: s.nom })), { cle: 'particuliers', libelle: 'Particuliers' }];
  const appartient = (cle: string, pid: string) => {
    const sid = structureDe.get(pid) ?? null;
    return cle === 'particuliers' ? !sid || !structures.some(s => s.id === sid) : sid === cle;
  };
  return groupes.map(g => {
    const ids = new Set(participants.filter(p => appartient(g.cle, p.id)).map(p => p.id));
    const seancesG = seances.filter(s => ids.has(s.participantId));
    const coursG = g.cle === 'particuliers' ? [] : cours.filter(c => c.structureId === g.cle);
    const p = presenceRecente(seancesG, aujourdhui, 90);
    return {
      cle: g.cle, libelle: g.libelle,
      beneficiaires: suivis.filter(x => appartient(g.cle, x.id)).length,
      minutesMois: minutesRealisees(seancesG, coursG, debutMois, aujourdhui),
      coursMois: coursG.filter(c => c.statut === 'realise' && c.date >= debutMois && c.date <= aujourdhui).length,
      presence: p.taux,
      ca12Mois: Math.round(lignes.filter(l => ids.has(l.participantId)).reduce((t, l) => t + l.horizon + l.externe, 0) * 100) / 100,
    };
  }).filter(l => l.beneficiaires > 0 || l.minutesMois > 0 || l.ca12Mois > 0);
}

// ─── Assiduité ───────────────────────────────────────────────────────────────

export interface Assiduite {
  participantId: string;
  realisees: number;
  annulees: number;
  taux: number;
}

/**
 * Assiduité par bénéficiaire sur les `jours` derniers jours (séances passées), des moins
 * assidus aux plus assidus. On ignore ceux qui ont moins de `minimum` séances comptées : un
 * taux sur une ou deux séances ne dit rien.
 */
export function assiduiteParBeneficiaire(
  seances: readonly SeanceStat[], aujourdhui: string, jours = 90, minimum = 3,
): Assiduite[] {
  const debut = ajouterJours(aujourdhui, -jours);
  const parPersonne = new Map<string, { realisees: number; annulees: number }>();
  for (const s of seances) {
    if (s.date < debut || s.date >= aujourdhui) continue;
    if (s.statut !== 'realisee' && s.statut !== 'annulee') continue;
    const c = parPersonne.get(s.participantId) ?? { realisees: 0, annulees: 0 };
    if (s.statut === 'realisee') c.realisees++; else c.annulees++;
    parPersonne.set(s.participantId, c);
  }
  return [...parPersonne.entries()]
    .filter(([, c]) => c.realisees + c.annulees >= minimum)
    .map(([participantId, c]) => ({ participantId, ...c, taux: taux(c.realisees, c.annulees) ?? 0 }))
    .sort((x, y) => x.taux - y.taux || y.annulees - x.annulees);
}

// ─── Résultats cliniques ─────────────────────────────────────────────────────

interface MesureTest {
  cle: string;
  libelle: string;
  lire: (b: Bilan) => number | null;
  plusPetitEstMieux: boolean;
  /** Écart en dessous duquel on parle de stabilité (unités du test, pas en %). */
  seuil: number;
  unite: string;
}

function moyenneCotes(c: { droite: number | null; gauche: number | null } | undefined): number | null {
  const v = [c?.droite, c?.gauche].filter((x): x is number => typeof x === 'number');
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function scoreMemoire(b: Bilan): number | null {
  const m = b.memoire;
  if (!m) return null;
  if (typeof m.dubois?.scoreMIS === 'number') return m.dubois.scoreMIS;
  if (typeof m.scoreImmediat === 'number' || typeof m.scoreDiffere === 'number') {
    return (m.scoreImmediat ?? 0) + (m.scoreDiffere ?? 0);
  }
  return null;
}

// Seuils en unités du test et non en % : la souplesse peut être négative ou nulle, et un
// pourcentage sur un TUG de 8 s ou sur 400 m de TM6 ne veut pas dire la même chose.
const MESURES: MesureTest[] = [
  { cle: 'tm6', libelle: 'Endurance (TM6)', lire: b => distanceTm6(b.tm6), plusPetitEstMieux: false, seuil: 30, unite: ' m' },
  { cle: 'force', libelle: 'Lever de chaise 30 s', lire: b => b.chairStand30 ?? null, plusPetitEstMieux: false, seuil: 2, unite: ' levers' },
  { cle: 'tug', libelle: 'Timed Up and Go', lire: b => b.tug3m ?? null, plusPetitEstMieux: true, seuil: 1, unite: ' s' },
  { cle: 'equilibre', libelle: 'Équilibre unipodal', lire: b => moyenneCotes(b.equilibre), plusPetitEstMieux: false, seuil: 2, unite: ' s' },
  { cle: 'handGrip', libelle: 'Force de préhension', lire: b => moyenneCotes(b.handGrip), plusPetitEstMieux: false, seuil: 2, unite: ' kg' },
  { cle: 'souplesse', libelle: 'Souplesse', lire: b => b.souplesse?.valeur ?? null, plusPetitEstMieux: false, seuil: 2, unite: ' cm' },
  { cle: 'memoire', libelle: 'Mémoire', lire: scoreMemoire, plusPetitEstMieux: false, seuil: 1, unite: ' point' },
];

export interface ResultatTest {
  cle: string;
  libelle: string;
  progressent: number;
  stables: number;
  reculent: number;
  total: number;
  /** Ce qu'on appelle « stable », pour l'info-bulle : « moins de 30 m d'écart ». */
  seuilTexte: string;
}

/**
 * Pour chaque test : combien de bénéficiaires progressent, restent stables ou reculent entre
 * leur premier et leur dernier bilan où le test a été passé. Les tests sans aucun bénéficiaire
 * comparable sont omis.
 */
export function resultatsParTest(participants: readonly Pick<Participant, 'bilans'>[]): ResultatTest[] {
  return MESURES.map(m => {
    let progressent = 0, stables = 0, reculent = 0;
    for (const p of participants) {
      const valeurs = [...(p.bilans ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(b => { try { return m.lire(b); } catch { return null; } })
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (valeurs.length < 2) continue;
      const ecart = valeurs[valeurs.length - 1] - valeurs[0];
      const gain = m.plusPetitEstMieux ? -ecart : ecart;
      if (gain >= m.seuil) progressent++;
      else if (gain <= -m.seuil) reculent++;
      else stables++;
    }
    return {
      cle: m.cle, libelle: m.libelle, progressent, stables, reculent,
      total: progressent + stables + reculent,
      seuilTexte: `moins de ${String(m.seuil).replace('.', ',')}${m.unite} d’écart`,
    };
  })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total || b.progressent / b.total - a.progressent / a.total);
}

// ─── Le mois en quelques mots ────────────────────────────────────────────────

/**
 * Le mois raconté en deux ou trois phrases, sur le ton de l'accueil (2026-11-24, demande de Lorenzo :
 * « un côté humain, sympa »). Encourageant mais honnête : une baisse se dit, avec une piste, jamais
 * avec un reproche. Ne parle que de ce qui est connu (pas d'objectif : pas de pourcentage).
 */
export function phrasesDuMois(m: {
  /** « novembre » */
  mois: string;
  minutes: number;
  minutesMoisPrecedent: number;
  realise: number;
  objectif: number;
  presence: number | null;
  progressent: number;
  arrivees: number;
}): string[] {
  const phrases: string[] = [];
  const heures = formaterHeures(m.minutes);
  const euros = `${Math.round(m.realise).toLocaleString('fr-FR')} €`;
  const elan = m.minutes === 0
    ? `${m.mois.charAt(0).toUpperCase()}${m.mois.slice(1)} commence : vos premières séances vont s’afficher ici.`
    : m.minutes >= m.minutesMoisPrecedent
      ? `${m.mois.charAt(0).toUpperCase()}${m.mois.slice(1)} avance bien : ${heures} de séance et ${euros} déjà réalisés.`
      : `${m.mois.charAt(0).toUpperCase()}${m.mois.slice(1)} est un peu plus calme que le mois dernier : ${heures} de séance et ${euros} déjà réalisés.`;
  phrases.push(m.objectif > 0 && m.minutes > 0
    ? `${elan.slice(0, -1)}, soit ${Math.round((m.realise / m.objectif) * 100)} % de votre objectif.`
    : elan);
  if (m.presence !== null) {
    phrases.push(m.presence >= 90
      ? `Vos bénéficiaires sont fidèles au rendez-vous : ${m.presence} % de présence sur 30 jours.`
      : m.presence >= 80
        ? `${m.presence} % de présence sur 30 jours : un bon rythme.`
        : `La présence a baissé (${m.presence} % sur 30 jours) : un petit message aux absents aide souvent à renouer.`);
  }
  if (m.progressent > 0 || m.arrivees > 0) {
    const bouts: string[] = [];
    if (m.progressent > 0) bouts.push(m.progressent > 1
      ? `${m.progressent} bénéficiaires ont progressé à leur dernier bilan`
      : '1 bénéficiaire a progressé à son dernier bilan');
    if (m.arrivees > 0) bouts.push(`${m.arrivees} nouvelle${m.arrivees > 1 ? 's' : ''} personne${m.arrivees > 1 ? 's' : ''} vous ${m.arrivees > 1 ? 'ont' : 'a'} rejoint en 3 mois`);
    phrases.push(`${bouts.join(', et ')}.`.replace(/^./, c => c.toUpperCase()));
  }
  return phrases;
}
