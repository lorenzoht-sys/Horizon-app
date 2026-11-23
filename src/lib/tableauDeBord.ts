import type { Bilan, Seance } from '../types';
import { calculerNote, NORMES_SCORING } from '../data/norms';
import { resultatTm6 } from './tm6';

/**
 * Calculs du tableau de bord praticien (refonte du 23/11/2026, maquette validée par Lorenzo).
 * Logique pure, sans requête : les données viennent des hooks existants.
 */

/** Règle historique du tableau de bord : un bilan est « à faire » 85 jours après le dernier. */
const JOURS_AVANT_BILAN = 85;

const JOUR_MS = 86_400_000;

function jourUtc(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function ecartJours(de: string, a: string): number {
  return Math.round((jourUtc(a) - jourUtc(de)) / JOUR_MS);
}

function enSemaines(jours: number): string {
  if (jours < 14) return `${jours} j`;
  return `${Math.round(jours / 7)} sem.`;
}

export type EtatEcheance = 'initial' | 'retard' | 'bientot' | 'a_jour';

export interface EcheanceBilan {
  etat: EtatEcheance;
  libelle: string;
}

/**
 * Échéance du prochain bilan : 85 jours après le dernier. « bientôt » dans les 14 derniers jours.
 * Même seuil que le chiffre « Bilans à faire », pour que la carte et le chiffre disent la même chose.
 */
export function echeanceBilan(bilans: readonly Pick<Bilan, 'date'>[], aujourdhui: string): EcheanceBilan {
  const dernier = [...bilans].map(b => b.date.slice(0, 10)).sort().at(-1);
  if (!dernier) return { etat: 'initial', libelle: 'Bilan initial à faire' };
  const restant = JOURS_AVANT_BILAN - ecartJours(dernier, aujourdhui);
  if (restant < 0) return { etat: 'retard', libelle: `En retard de ${enSemaines(-restant)}` };
  if (restant === 0) return { etat: 'retard', libelle: 'À faire aujourd’hui' };
  if (restant <= 14) return { etat: 'bientot', libelle: `Dans ${enSemaines(restant)}` };
  return { etat: 'a_jour', libelle: `Dans ${enSemaines(restant)}` };
}

export function bilanAFaire(bilans: readonly Pick<Bilan, 'date'>[], aujourdhui: string): boolean {
  const { etat } = echeanceBilan(bilans, aujourdhui);
  return etat === 'initial' || etat === 'retard';
}

export type Niveau = 'norme' | 'surveiller' | 'difficulte';

/** Même lecture que le profil fonctionnel : note 4-5 dans la norme, 3 à surveiller, 1-2 en difficulté. */
function niveauDeNote(note: 1 | 2 | 3 | 4 | 5): Niveau {
  if (note >= 4) return 'norme';
  if (note === 3) return 'surveiller';
  return 'difficulte';
}

export const LIBELLE_NIVEAU: Record<Niveau, string> = {
  norme: 'Dans la norme',
  surveiller: 'À surveiller',
  difficulte: 'En difficulté',
};

export interface ResultatCle {
  cle: string;
  libelle: string;
  valeur: string;
  /** null : pas de norme applicable (TM6 en pas ou en tours). */
  niveau: Niveau | null;
}

function noter(valeur: number, cleNorme: string): Niveau | null {
  const norme = NORMES_SCORING[cleNorme];
  return norme ? niveauDeNote(calculerNote(valeur, norme)) : null;
}

/** Les quatre résultats montrés sur la carte d'un bénéficiaire, tirés de son dernier bilan. */
export function resultatsCles(bilan: Bilan | undefined): ResultatCle[] {
  if (!bilan) return [];
  const sortie: ResultatCle[] = [];
  if (bilan.tug3m != null) {
    sortie.push({ cle: 'tug', libelle: 'TUG', valeur: `${bilan.tug3m} s`, niveau: noter(bilan.tug3m, 'tug3m') });
  }
  if (bilan.chairStand30 != null) {
    sortie.push({ cle: 'lever', libelle: 'Lever', valeur: String(bilan.chairStand30), niveau: noter(bilan.chairStand30, 'chairStand30') });
  }
  const grip = bilan.handGrip?.droite ?? null;
  if (grip != null) {
    sortie.push({ cle: 'grip', libelle: 'Grip', valeur: `${grip} kg`, niveau: noter(grip, 'handGrip') });
  }
  const tm6 = resultatTm6(bilan.tm6);
  if (tm6.valeur != null) {
    // Pas ou tours : aucune norme commune avec les mètres (cf. tm6.ts), donc pas de couleur.
    sortie.push({
      cle: 'tm6', libelle: 'TM6',
      valeur: tm6.type === 'distance' ? `${tm6.valeur} m` : tm6.texte,
      niveau: tm6.type === 'distance' ? noter(tm6.valeur, 'tm6Distance') : null,
    });
  }
  return sortie;
}

/** Prochaine séance non annulée d'un bénéficiaire, à partir de maintenant. */
export function prochaineSeance(
  seances: readonly Seance[],
  participantId: string,
  aujourdhui: string,
  maintenant: string,
): Seance | null {
  return seances
    .filter(s => s.participantId === participantId && s.statut === 'planifiee'
      && (s.date > aujourdhui || (s.date === aujourdhui && s.heureDebut.slice(0, 5) >= maintenant)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))[0] ?? null;
}

const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

/** « Aujourd'hui · 14:30 », « Demain · 09:00 », « Jeu. 26 · 09:00 », « 12 déc. · 10:00 ». */
export function libelleRendezVous(s: Pick<Seance, 'date' | 'heureDebut'>, aujourdhui: string): string {
  const heure = s.heureDebut.slice(0, 5);
  const ecart = ecartJours(aujourdhui, s.date);
  if (ecart === 0) return `Aujourd’hui · ${heure}`;
  if (ecart === 1) return `Demain · ${heure}`;
  const d = new Date(`${s.date}T12:00:00`);
  if (ecart > 1 && ecart < 7) return `${JOURS_COURTS[d.getDay()]} ${d.getDate()} · ${heure}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${heure}`;
}

/**
 * Séances passées restées « planifiées » : elles n'entrent pas dans la facture. Sans limite de
 * date (retour de Pierre du 23/11/2026) : une séance reste à confirmer tant qu'elle n'est ni
 * réalisée ni annulée.
 */
export function seancesNonConfirmees(seances: readonly Seance[], aujourdhui: string, maintenant: string): Seance[] {
  return seances.filter(s => s.statut === 'planifiee' && (
    s.date < aujourdhui || (s.date === aujourdhui && s.heureFin.slice(0, 5) < maintenant)
  ));
}

/** Lundi et dimanche de la semaine d'une date (AAAA-MM-JJ). */
export function bornesSemaine(aujourdhui: string): { lundi: string; dimanche: string } {
  const d = new Date(`${aujourdhui}T12:00:00`);
  const decalage = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const lundi = new Date(d); lundi.setDate(d.getDate() + decalage);
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { lundi: iso(lundi), dimanche: iso(dimanche) };
}

// ── « À surveiller » ─────────────────────────────────────────────────────────
// Remplace les bandeaux empilés (contrats, ressentis, bilans en cours) par une seule ligne de
// pastilles, une action par point. Ordre : la santé, puis l'administratif. Les séances à
// confirmer ont leur propre bloc.

type TypeATraiter = 'ressentis' | 'brouillon' | 'contrat' | 'contrat_jours' | 'douleur' | 'relancer';

export interface ElementATraiter {
  cle: string;
  type: TypeATraiter;
  titre: string;
  detail: string;
  action: string;
  lien: string;
  /** Rouge pour la santé, orange pour le reste. */
  gravite: 'haute' | 'normale';
}

export interface EntreesATraiter {
  ressentis: { id: string; nom: string }[];
  brouillons: { participantId: string; nom: string; etape: number }[];
  contratsARenouveler: { participantId: string; nom: string; joursRestants: number }[];
  contratsSansJours: { participantId: string; nom: string }[];
}

export function elementsATraiter(e: EntreesATraiter): ElementATraiter[] {
  const liste: ElementATraiter[] = [];
  for (const r of e.ressentis) {
    liste.push({
      cle: `ressentis-${r.id}`, type: 'ressentis', gravite: 'haute',
      titre: 'Ressentis dégradés', detail: `${r.nom} · 3 séances difficiles de suite`,
      action: 'Voir', lien: `/participant/${r.id}`,
    });
  }
  for (const b of e.brouillons) {
    liste.push({
      cle: `brouillon-${b.participantId}`, type: 'brouillon', gravite: 'normale',
      titre: 'Bilan commencé', detail: `${b.nom} · arrêté à l’étape ${b.etape + 1}`,
      action: 'Reprendre', lien: `/participant/${b.participantId}/bilan/new`,
    });
  }
  for (const c of e.contratsARenouveler) {
    liste.push({
      cle: `contrat-${c.participantId}`, type: 'contrat', gravite: 'normale',
      titre: 'Contrat bientôt terminé',
      detail: `${c.nom} · ${c.joursRestants === 0 ? 'se termine aujourd’hui' : `dans ${c.joursRestants} jour${c.joursRestants > 1 ? 's' : ''}`}`,
      action: 'Renouveler', lien: `/participant/${c.participantId}/contrat/nouveau`,
    });
  }
  for (const c of e.contratsSansJours) {
    liste.push({
      cle: `jours-${c.participantId}`, type: 'contrat_jours', gravite: 'normale',
      titre: 'Jours de séance manquants', detail: `${c.nom} · le contrat ne se renouvellera pas seul`,
      action: 'Compléter', lien: `/participant/${c.participantId}`,
    });
  }
  return liste;
}

// ── Tableau de bord V1 (maquette validée par Lorenzo le 23/11/2026, après-midi) ─────────────
// Ton voulu : humain, qui donne envie, pédagogique. Les fonctions ci-dessous fabriquent les
// phrases et les listes ; l'écran ne fait que les afficher.

/** Minutes entre deux heures « HH:MM » du même jour (négatif si `a` est avant `de`). */
function minutesEntre(de: string, a: string): number {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return m(a) - m(de);
}

/** « dans 25 min », « dans 2 h 10 », « dans 3 h » ; « maintenant » à moins de 5 minutes. */
export function libelleDelai(minutes: number): string {
  if (minutes < 5) return 'maintenant';
  if (minutes < 60) return `dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `dans ${h} h` : `dans ${h} h ${String(reste).padStart(2, '0')}`;
}

/** Délai affiché pour un rendez-vous : « dans 2 h 10 » aujourd'hui, sinon « demain », « jeudi »… */
export function delaiRendezVous(s: Pick<Seance, 'date' | 'heureDebut'>, aujourdhui: string, maintenant: string): string {
  const ecart = ecartJours(aujourdhui, s.date);
  if (ecart === 0) return libelleDelai(minutesEntre(maintenant, s.heureDebut.slice(0, 5)));
  if (ecart === 1) return 'demain';
  const d = new Date(`${s.date}T12:00:00`);
  if (ecart < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/** Prochain rendez-vous individuel, tous bénéficiaires confondus (séance ou bilan planifié). */
export function prochainRendezVous(seances: readonly Seance[], aujourdhui: string, maintenant: string): Seance | null {
  return seances
    .filter(s => s.statut === 'planifiee' && !!s.participantId
      && (s.date > aujourdhui || (s.date === aujourdhui && s.heureDebut.slice(0, 5) >= maintenant)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))[0] ?? null;
}

export interface ResumeJournee {
  nbRendezVous: number;
  /** Délai avant le prochain rendez-vous du jour, null s'il n'y en a plus. */
  prochainDans: string | null;
  nbAConfirmer: number;
  /** Bilans du jour encore à venir (un bilan passé non confirmé est compté dans nbAConfirmer). */
  nbBilansAujourdhui: number;
}

/**
 * La phrase sous « Bonjour » : la journée racontée en une ou deux phrases, au lieu d'une rangée
 * de chiffres. Exemple : « Une journée bien remplie : 4 rendez-vous, le prochain dans 2 h 10.
 * 2 séances attendent juste votre confirmation. »
 */
export function phraseDuJour(r: ResumeJournee): string {
  const phrases: string[] = [];
  if (r.nbRendezVous === 0) {
    phrases.push('Aucun rendez-vous aujourd’hui : un bon moment pour préparer vos bilans et vos programmes.');
  } else {
    const debut = r.nbRendezVous >= 4 ? 'Une journée bien remplie : ' : 'Aujourd’hui : ';
    const rdv = `${r.nbRendezVous} rendez-vous`;
    const suite = r.prochainDans
      ? (r.prochainDans === 'maintenant' ? ', le prochain commence maintenant' : `, le prochain ${r.prochainDans}`)
      : ', tous passés';
    phrases.push(`${debut}${rdv}${suite}.`);
  }
  if (r.nbBilansAujourdhui > 0) {
    phrases.push(r.nbBilansAujourdhui === 1 ? 'Un bilan est prévu aujourd’hui.' : `${r.nbBilansAujourdhui} bilans sont prévus aujourd’hui.`);
  }
  if (r.nbAConfirmer > 0) {
    phrases.push(r.nbAConfirmer === 1
      ? 'Une séance attend juste votre confirmation.'
      : `${r.nbAConfirmer} séances attendent juste votre confirmation.`);
  }
  return phrases.join(' ');
}

export interface ContexteBeneficiaire {
  /** Objectif personnel noté au bilan (le plus récent qui en a un). */
  objectif: string | null;
  /** Points de vigilance du dernier bilan. */
  vigilance: string | null;
}

/** Ce qu'il faut avoir en tête avant de voir quelqu'un, tiré de ses bilans. */
export function contexteBeneficiaire(bilans: readonly Pick<Bilan, 'date' | 'pointsVigilance' | 'profilEnrichi'>[]): ContexteBeneficiaire {
  const tries = [...bilans].sort((a, b) => b.date.localeCompare(a.date));
  const objectif = tries.map(b => b.profilEnrichi?.objectifsPersonnels?.trim()).find(o => !!o) ?? null;
  const vigilance = tries[0]?.pointsVigilance?.trim() || null;
  return { objectif, vigilance };
}

export interface Progres {
  test: string;
  /** « −4 s », « +90 m », « +5 » */
  delta: string;
  /** Ce que ça veut dire, en mots simples. */
  sens: string;
}

interface MesureProgres {
  test: string;
  lire: (b: Bilan) => number | null;
  unite: string;
  plusPetitEstMieux: boolean;
  /** Écart minimal pour parler de progrès (au-delà de la variation d'un jour à l'autre). */
  seuil: number;
  /** Poids pour choisir le progrès le plus parlant quand il y en a plusieurs. */
  echelle: number;
  sens: string;
}

const MESURES_PROGRES: MesureProgres[] = [
  { test: 'au TUG', lire: b => b.tug3m, unite: ' s', plusPetitEstMieux: true, seuil: 1, echelle: 4,
    sens: 'Se lever et marcher 3 m plus vite : moins de risque de chute.' },
  { test: 'levers de chaise', lire: b => b.chairStand30, unite: '', plusPetitEstMieux: false, seuil: 2, echelle: 4,
    sens: 'Des jambes plus fortes, en 30 secondes.' },
  { test: 'au TM6', lire: b => { const t = resultatTm6(b.tm6); return t.type === 'distance' ? t.valeur : null; },
    unite: ' m', plusPetitEstMieux: false, seuil: 25, echelle: 80, sens: 'Plus loin en 6 minutes de marche qu’au départ.' },
  { test: 'de force de main', lire: b => b.handGrip?.droite ?? null, unite: ' kg', plusPetitEstMieux: false, seuil: 2, echelle: 5,
    sens: 'Plus de force pour porter, ouvrir, se tenir.' },
];

function formaterEcart(ecart: number, unite: string): string {
  const arrondi = Math.round(ecart * 10) / 10;
  const texte = String(Math.abs(arrondi)).replace('.', ',');
  return `${arrondi < 0 ? '−' : '+'}${texte}${unite}`;
}

/**
 * Le progrès le plus parlant entre le premier et le dernier bilan, ou null s'il n'y a pas
 * deux bilans comparables ou aucun progrès net. Ne montre jamais un recul : ce bloc est fait
 * pour encourager, les reculs restent visibles sur la fiche (profil fonctionnel).
 */
export function progresDepuisInitial(bilans: readonly Bilan[]): Progres | null {
  if (bilans.length < 2) return null;
  const tries = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  let meilleur: { score: number; progres: Progres } | null = null;
  for (const m of MESURES_PROGRES) {
    const premier = tries.map(m.lire).find(v => v != null) ?? null;
    const dernier = [...tries].reverse().map(m.lire).find(v => v != null) ?? null;
    if (premier == null || dernier == null) continue;
    const ecart = dernier - premier;
    const gain = m.plusPetitEstMieux ? -ecart : ecart;
    if (gain < m.seuil) continue;
    const score = gain / m.echelle;
    if (!meilleur || score > meilleur.score) {
      meilleur = { score, progres: { test: m.test, delta: formaterEcart(ecart, m.unite), sens: m.sens } };
    }
  }
  return meilleur?.progres ?? null;
}

const RANG_ECHEANCE: Record<EtatEcheance, number> = { retard: 0, initial: 1, bientot: 2, a_jour: 3 };

export interface BilanAPrevoir {
  participantId: string;
  etat: EtatEcheance;
  libelle: string;
  /** « Bilan initial », « 3e bilan » */
  type: string;
}

/** Les prochains bilans, du plus urgent au plus lointain. */
export function prochainsBilans(
  participants: readonly { id: string; bilans: readonly Pick<Bilan, 'date'>[] }[],
  aujourdhui: string,
  combien = 4,
): BilanAPrevoir[] {
  return participants
    .map(p => {
      const e = echeanceBilan(p.bilans, aujourdhui);
      const rang = p.bilans.length + 1;
      return { participantId: p.id, etat: e.etat, libelle: e.libelle, type: rang === 1 ? 'Bilan initial' : `${rang}e bilan`, dernier: [...p.bilans].map(b => b.date).sort().at(-1) ?? '' };
    })
    .sort((a, b) => RANG_ECHEANCE[a.etat] - RANG_ECHEANCE[b.etat] || a.dernier.localeCompare(b.dernier))
    .slice(0, combien)
    .map(({ participantId, etat, libelle, type }) => ({ participantId, etat, libelle, type }));
}

export interface ResumeFactures {
  aValider: number;
  enRetard: number;
  nonReglees: number;
}

/**
 * Compteurs des factures en attente, en lecture seule (le tableau de bord ne modifie rien).
 * « À valider » : brouillons dont le mois est terminé (même règle que la page Factures à valider).
 */
export function resumeFactures(
  nbBrouillonsValidables: number,
  validees: readonly { type: string; statut: string }[],
): ResumeFactures {
  const factures = validees.filter(f => f.type === 'facture');
  return {
    aValider: nbBrouillonsValidables,
    enRetard: factures.filter(f => f.statut === 'en_retard').length,
    nonReglees: factures.filter(f => f.statut === 'validee' || f.statut === 'envoyee').length,
  };
}

export interface Astuce {
  cle: string;
  texte: string;
  action: string;
  lien: string;
}

/** Une astuce à la fois, qu'on peut écarter : on apprend Horizon en s'en servant. */
export const ASTUCES: Astuce[] = [
  // lien « action:dictee » : le tableau de bord ouvre directement « Dicter une séance : pour qui ? ».
  { cle: 'dictee', texte: 'Juste après une séance, touchez « Dicter une séance » et parlez deux minutes : Horizon rédige le compte rendu et coche les exercices faits.', action: 'Essayer maintenant', lien: 'action:dictee' },
  { cle: 'comparaison', texte: 'Dès le deuxième bilan, « Évolution » sur la fiche montre les progrès test par test : un bon support à montrer à la personne et à son médecin.', action: 'Voir mes bénéficiaires', lien: '/#beneficiaires' },
  { cle: 'bibliotheque', texte: 'Vos programmes partent de la bibliothèque d’exercices : enregistrez un programme comme modèle pour le réutiliser en un clic.', action: 'Ouvrir la bibliothèque', lien: '/bibliotheque' },
  { cle: 'espace', texte: 'Chaque bénéficiaire peut retrouver son programme sur son téléphone, avec un code d’accès : « Espace bénéficiaire » sur sa fiche.', action: 'Voir mes bénéficiaires', lien: '/#beneficiaires' },
  { cle: 'factures', texte: 'Les factures se préparent seules à partir des séances réalisées : confirmez vos séances, puis validez-les en début de mois.', action: 'Ouvrir les factures', lien: '/factures/a-valider' },
];

/** L'astuce du jour : change chaque jour, saute celles déjà écartées ; null quand tout est vu. */
export function astuceDuJour(aujourdhui: string, ecartees: ReadonlySet<string>): Astuce | null {
  const restantes = ASTUCES.filter(a => !ecartees.has(a.cle));
  if (restantes.length === 0) return null;
  const jour = Math.floor(jourUtc(aujourdhui) / JOUR_MS);
  return restantes[jour % restantes.length];
}

// ── Regroupement de « À surveiller » (retour de Lorenzo du 23/11/2026) ─────────────────────
// Avec une vingtaine de bénéficiaires, une pastille par personne remplissait quatre lignes. On
// affiche une pastille par type (« 5 bilans commencés »), qui se déplie sur la liste des noms.

const LIBELLES_GROUPE: Record<TypeATraiter, [string, string]> = {
  ressentis: ['bénéficiaire aux ressentis dégradés', 'bénéficiaires aux ressentis dégradés'],
  douleur: ['douleur signalée aujourd’hui', 'douleurs signalées aujourd’hui'],
  brouillon: ['bilan commencé', 'bilans commencés'],
  contrat: ['contrat bientôt terminé', 'contrats bientôt terminés'],
  contrat_jours: ['contrat sans jours de séance', 'contrats sans jours de séance'],
  relancer: ['bénéficiaire sans séance depuis 3 semaines', 'bénéficiaires sans séance depuis 3 semaines'],
};

// Santé d'abord, puis l'administratif.
const ORDRE_GROUPES: TypeATraiter[] = ['douleur', 'ressentis', 'brouillon', 'contrat', 'contrat_jours', 'relancer'];

export interface GroupeASurveiller {
  type: TypeATraiter;
  gravite: 'haute' | 'normale';
  /** « 5 bilans commencés », « 1 contrat bientôt terminé » */
  libelle: string;
  elements: ElementATraiter[];
}

export function regrouperASurveiller(elements: readonly ElementATraiter[]): GroupeASurveiller[] {
  return ORDRE_GROUPES.flatMap(type => {
    const du = elements.filter(e => e.type === type);
    if (du.length === 0) return [];
    const [un, plusieurs] = LIBELLES_GROUPE[type];
    return [{
      type,
      gravite: du.some(e => e.gravite === 'haute') ? 'haute' as const : 'normale' as const,
      libelle: `${du.length} ${du.length > 1 ? plusieurs : un}`,
      elements: du,
    }];
  });
}
