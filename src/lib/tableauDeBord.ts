import type { Bilan, Seance } from '../types';
import { calculerNote, NORMES_SCORING } from '../data/norms';
import { resultatTm6 } from './tm6';

/**
 * Calculs du tableau de bord praticien (refonte du 23/11/2026, maquette validée par Lorenzo).
 * Logique pure, sans requête : les données viennent des hooks existants.
 */

/** Règle historique du tableau de bord : un bilan est « à faire » 85 jours après le dernier. */
export const JOURS_AVANT_BILAN = 85;

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
export function niveauDeNote(note: 1 | 2 | 3 | 4 | 5): Niveau {
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

/** Séances passées restées « planifiées » (60 jours) : elles n'entrent pas dans la facture. */
export function seancesNonConfirmees(seances: readonly Seance[], aujourdhui: string, maintenant: string): Seance[] {
  const debut = new Date(`${aujourdhui}T12:00:00`);
  debut.setDate(debut.getDate() - 60);
  const dateMin = debut.toISOString().slice(0, 10);
  return seances.filter(s => s.statut === 'planifiee' && (
    (s.date < aujourdhui && s.date >= dateMin) || (s.date === aujourdhui && s.heureFin.slice(0, 5) < maintenant)
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

// ── « À traiter » ────────────────────────────────────────────────────────────
// Remplace les bandeaux empilés (contrats, ressentis, bilans en cours) par une seule liste,
// une ligne et une action par point. Ordre : ce qui bloque la facture, puis ce qui concerne la
// santé, puis l'administratif.

export type TypeATraiter = 'seances' | 'ressentis' | 'brouillon' | 'contrat' | 'contrat_jours';

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
  nbSeancesNonConfirmees: number;
  ressentis: { id: string; nom: string }[];
  brouillons: { participantId: string; nom: string; etape: number }[];
  contratsARenouveler: { participantId: string; nom: string; joursRestants: number }[];
  contratsSansJours: { participantId: string; nom: string }[];
}

export function elementsATraiter(e: EntreesATraiter): ElementATraiter[] {
  const liste: ElementATraiter[] = [];
  if (e.nbSeancesNonConfirmees > 0) {
    const n = e.nbSeancesNonConfirmees;
    liste.push({
      cle: 'seances', type: 'seances', gravite: 'normale',
      titre: `${n} séance${n > 1 ? 's' : ''} à confirmer`,
      detail: 'Passée(s) mais encore « planifiée(s) » : hors facture tant qu’elle(s) ne sont pas confirmée(s)',
      action: 'Confirmer', lien: '/factures/seances',
    });
  }
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
