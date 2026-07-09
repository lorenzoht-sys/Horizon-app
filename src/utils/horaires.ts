import type { Contrat, PeriodiciteContrat, Seance } from '../types';

export function heureEnMinutes(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

export function minutesEnHeure(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60);
  const m = Math.max(0, minutes) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(heure: string, minutes: number): string {
  return minutesEnHeure(heureEnMinutes(heure) + minutes);
}

// Arrondit au quart d'heure SUPÉRIEUR (jamais inférieur) — un horaire déjà
// rond (ex: 10h00) reste inchangé. Utilisé par le planificateur pour ne
// jamais faire arriver Pierre avant l'heure réellement calculée.
export function arrondirAuQuartHeureSup(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

export function diffMinutes(debut: string, fin: string): number {
  return Math.max(0, heureEnMinutes(fin) - heureEnMinutes(debut));
}

export function estDansPlage(heure: string, debut: string, fin: string): boolean {
  const h = heureEnMinutes(heure);
  return h >= heureEnMinutes(debut) && h < heureEnMinutes(fin);
}

// ── Aimantation au pas (grille de planification manuelle) ────────────────────
// Pas de la grille de placement manuel (glisser-déposer / clic sur frise) —
// configurable ici plutôt qu'en valeur en dur éparpillée dans les composants.
export const PAS_MINUTES = 15;

// Arrondit au multiple de PAS_MINUTES le plus proche (contrairement à
// arrondirAuQuartHeureSup qui arrondit toujours au-dessus).
export function arrondirAuPas(minutes: number, pas: number = PAS_MINUTES): number {
  return Math.round(minutes / pas) * pas;
}

export interface FenetreMinutes {
  debut: number;
  fin: number;
}

// Cale un créneau de durée `duree` démarrant à `minutesDebut` (déjà arrondi
// au pas) à l'intérieur de la fenêtre de disponibilité qui contient ce début.
// Si la durée déborde la fin de cette fenêtre (ex : arrondi qui tombe trop
// près de la fin de la dispo), recale sur le dernier début valide qui tient
// entièrement dans la fenêtre, plutôt que de rejeter le placement. Renvoie
// null si minutesDebut ne tombe dans aucune fenêtre, ou si la séance ne tient
// dans aucun cas dans la fenêtre visée (fenêtre plus courte que la durée).
export function calerDansFenetre(
  minutesDebut: number,
  duree: number,
  fenetres: FenetreMinutes[],
): number | null {
  const fenetre = fenetres.find(f => minutesDebut >= f.debut && minutesDebut < f.fin);
  if (!fenetre) return null;
  const dernierDebutPossible = fenetre.fin - duree;
  if (dernierDebutPossible < fenetre.debut) return null;
  return Math.max(fenetre.debut, Math.min(minutesDebut, dernierDebutPossible));
}

// ── Détection de chevauchement entre créneaux ─────────────────────────────────
// Logique partagée : useAgenda.detecterConflits (création simple), les deux
// interfaces de planification manuelle (ModalInsererPatient, PlanningGrilleView)
// et bulkCreerSeances (garde-fou final avant écriture en base).

export function heuresChevauchent(debutA: string, finA: string, debutB: string, finB: string): boolean {
  return debutA < finB && finA > debutB;
}

export interface CreneauCandidat {
  date: string;
  heureDebut: string;
  heureFin: string;
}

// Cherche, parmi les séances existantes (hors annulées), celle qui chevauche
// le créneau donné le même jour. excludeId permet d'ignorer la séance
// elle-même lors d'une modification.
export function trouveChevauchement(
  seancesExistantes: Seance[],
  creneau: CreneauCandidat,
  excludeId?: string,
): Seance | undefined {
  return seancesExistantes.find(s =>
    s.id !== excludeId &&
    s.statut !== 'annulee' &&
    s.date === creneau.date &&
    heuresChevauchent(creneau.heureDebut, creneau.heureFin, s.heureDebut, s.heureFin)
  );
}

// Variante bulk : vérifie une liste de créneaux candidats d'un coup (ex :
// toutes les occurrences récurrentes générées pour un contrat) et renvoie
// chaque paire (créneau candidat, séance existante en collision).
export function trouveChevauchements<T extends CreneauCandidat>(
  seancesExistantes: Seance[],
  creneaux: T[],
): { creneau: T; existante: Seance }[] {
  const resultats: { creneau: T; existante: Seance }[] = [];
  for (const creneau of creneaux) {
    const existante = trouveChevauchement(seancesExistantes, creneau);
    if (existante) resultats.push({ creneau, existante });
  }
  return resultats;
}

// ── Anti-doublon à la création (glisser un bénéficiaire) ──────────────────────
// Reflète très exactement la contrainte d'unicité posée en base
// (seances_no_double_contrat_idx : participant_id, date, contrat_id, hors
// séances annulées — voir supabase/migrations/20260622_unique_seances_patient.sql).
// Un bénéficiaire ne peut avoir qu'une seule séance non-annulée par contrat et
// par jour, quelle que soit l'heure. Filtre les dates déjà couvertes AVANT
// tout insert, pour ne jamais tenter un doublon — plutôt que de laisser la
// contrainte base le rejeter après coup.
export function datesManquantes(seances: Seance[], participantId: string, contratId: string, dates: string[]): string[] {
  const dejaPresentes = new Set(
    seances
      .filter(s => s.participantId === participantId && s.contratId === contratId && s.statut !== 'annulee')
      .map(s => s.date)
  );
  return dates.filter(d => !dejaPresentes.has(d));
}

// ── Messages d'erreur humains pour les opérations sur les séances ────────────
// Ne jamais laisser fuiter un message Postgres brut ("duplicate key value
// violates unique constraint ...") jusqu'à l'utilisateur — traduit les
// signatures d'erreur connues, avec repli générique sinon. Le code SQLSTATE
// '23505' (unique_violation) est le signal le plus fiable, indépendant du
// texte exact du message.
export function messageErreurSeance(error: { message: string; code?: string }): string {
  const estViolationUnicite = error.code === '23505' || error.message.includes('duplicate key value violates unique constraint');
  if (estViolationUnicite) {
    if (error.message.includes('seances_no_double_contrat_idx')) {
      return 'Ce bénéficiaire a déjà une séance planifiée à cette date pour ce contrat.';
    }
    return 'Cette séance existe déjà.';
  }
  return "Une erreur est survenue lors de l'enregistrement. Réessayez.";
}

// ── Identification d'une « série » récurrente (planning manuel) ──────────────
// Il n'existe aucun identifiant de récurrence en base (table `seances` : pas
// de colonne recurrence_id) — le seul lien structurel est contratId, qui ne
// suffit pas seul (un contrat peut porter plusieurs créneaux hebdomadaires
// différents si nbSeancesSemaine > 1, ex : lundi + mercredi + vendredi). On
// identifie donc une série par une clé composite calculée à la volée :
// bénéficiaire + contrat + jour de la semaine.
//
// L'heure n'entre PAS dans la clé (contrairement à une version antérieure) :
// règle métier confirmée — un bénéficiaire n'a jamais deux séances le même
// jour pour le même contrat, donc (participantId, contratId, jourSemaine)
// identifie déjà un rythme sans ambiguïté. Inclure l'heure cassait le
// déplacement en masse dès qu'un léger écart d'heure existait entre
// occurrences d'un même jour (dérive historique, ou correction manuelle
// ponctuelle) : la série se scindait en plusieurs sous-groupes invisibles
// les uns des autres, et « déplacer cette séance et les suivantes » n'en
// déplaçait qu'un sous-ensemble, laissant les autres au jour d'origine.
//
// Une occurrence déplacée à un autre JOUR sort naturellement de cette clé
// (jourSemaine change) — c'est le comportement voulu pour isoler un
// déplacement ponctuel. Un simple changement d'heure sur le même jour ne
// l'isole plus : elle reste rattachée au rythme de ce jour, et un futur
// déplacement de masse la rattrape — c'est exactement l'effet recherché
// (unifier une dérive d'heure au sein d'un même jour).
export function cleSerieRecurrente(s: Seance): string {
  const jourSemaine = new Date(s.date + 'T12:00').getDay();
  return `${s.participantId}::${s.contratId ?? ''}::${jourSemaine}`;
}

// Renvoie tous les membres de la même série qu'une séance de référence (elle
// incluse), triés par date croissante — hors séances annulées, SAUF la
// référence elle-même : si on désannule une séance (statut 'annulee' ->
// 'planifiee'), elle doit rester dans sa propre série même si son statut
// actuel est encore 'annulee' au moment du calcul, sous peine de s'exclure
// elle-même du choix "cette séance uniquement" / "et les suivantes" (bug
// constaté : la boîte de choix affichait une autre occurrence à sa place, et
// "et les suivantes" ne touchait jamais la séance réellement cliquée).
export function trouverSerieRecurrente(seances: Seance[], reference: Seance): Seance[] {
  const cle = cleSerieRecurrente(reference);
  return seances
    .filter(s => (s.id === reference.id || s.statut !== 'annulee') && cleSerieRecurrente(s) === cle)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface BlocRecurrent {
  seance: Seance;
  totalOccurrences: number;
}

// Regroupe les séances d'un même jour de la semaine par créneau récurrent
// (voir cleSerieRecurrente) pour l'affichage en un seul bloc visuel par
// créneau — extrait de FrisePlanningJour pour être testable indépendamment
// du rendu React. Représentant choisi : la prochaine occurrence à venir par
// rapport à `aujourdHui` (paramétrable pour les tests).
//
// Un créneau sans AUCUNE occurrence future ne produit plus de bloc du tout
// (auparavant, la dernière occurrence passée était affichée par défaut).
// Corrigé suite à un bug observé : après une suppression « et les
// suivantes », qui n'efface jamais l'historique par conception, une
// occurrence passée du même créneau réapparaissait comme représentante —
// donnant l'impression que « la séance supprimée est encore là » alors qu'il
// s'agissait d'une séance différente, plus ancienne. Cette grille sert à
// planifier l'avenir (glisser un bénéficiaire, déplacer un rendez-vous à
// venir) ; l'historique déjà réalisé n'a pas sa place ici et se consulte
// via l'agenda ou la fiche bénéficiaire — le supprimer de ce regroupement
// élimine la confusion à la source plutôt que de la documenter seulement.
export function regrouperParCreneau(seancesDuJour: Seance[], aujourdHui: string = new Date().toISOString().split('T')[0]): BlocRecurrent[] {
  const parCle = new Map<string, Seance[]>();
  for (const s of seancesDuJour) {
    const cle = cleSerieRecurrente(s);
    const arr = parCle.get(cle);
    if (arr) arr.push(s); else parCle.set(cle, [s]);
  }
  const blocs: BlocRecurrent[] = [];
  for (const occurrences of parCle.values()) {
    const futures = occurrences.filter(o => o.date >= aujourdHui).sort((a, b) => a.date.localeCompare(b.date));
    if (futures.length === 0) continue;
    blocs.push({ seance: futures[0], totalOccurrences: occurrences.length });
  }
  return blocs;
}

// Décale une date vers le jour de la semaine ciblé, en restant dans la même
// semaine calendaire (ex : mardi → vendredi de cette même semaine). Utilisé
// pour le déplacement (seul ou en série) d'une séance existante dans la
// grille de planning : la grille regroupe les blocs par jour de la semaine
// (motif récurrent), donc déposer sur une autre colonne ne dit que le
// nouveau jour de semaine visé — la semaine réelle reste celle de la séance
// d'origine (chaque occurrence garde sa propre semaine lors d'un déplacement
// de série).
export function dateDansMemeSemaine(dateOrigine: string, dowCible: number): string {
  const d = new Date(dateOrigine + 'T12:00');
  d.setDate(d.getDate() + (dowCible - d.getDay()));
  return d.toISOString().split('T')[0];
}

// Levée par bulkCreerSeances quand des chevauchements sont détectés et non
// explicitement ignorés — garde-fou pour tout appelant (présent ou futur) qui
// oublierait de vérifier lui-même avant d'insérer en base.
export class ChevauchementError extends Error {
  conflits: { creneau: CreneauCandidat; existante: Seance }[];
  constructor(conflits: { creneau: CreneauCandidat; existante: Seance }[]) {
    super('Chevauchement avec une séance existante');
    this.name = 'ChevauchementError';
    this.conflits = conflits;
  }
}

export const PLAGES = {
  matin:       { debut: '08:00', fin: '12:00', label: 'Matin (8h-12h)' },
  'apres-midi': { debut: '13:30', fin: '18:00', label: 'Après-midi (13h30-18h)' },
  soiree:      { debut: '18:00', fin: '21:00', label: 'Soirée (18h-21h)' },
} as const;

const JOURS_NUM: Record<string, number> = {
  dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6,
};

export const LABELS_JOURS_COURT: Record<string, string> = {
  lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam', dim: 'Dim',
};

export const LABELS_JOURS_LONG: Record<string, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi',
  jeu: 'Jeudi', ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

function toJoursNums(joursFixe: string | string[]): Set<number> {
  const jours = Array.isArray(joursFixe) ? joursFixe : [joursFixe];
  return new Set(jours.map(j => JOURS_NUM[j] ?? 1));
}

// Accepte un ou plusieurs jours
export function calculerNombreSeances(
  dateDebut: string,
  dateFin: string,
  joursFixe: string | string[]
): number {
  const joursNums = toJoursNums(joursFixe);
  let count = 0;
  const current = new Date(dateDebut);
  const fin = new Date(dateFin);
  while (current <= fin) {
    if (joursNums.has(current.getDay())) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function calculerDateFin(
  dateDebut: string,
  joursFixe: string | string[],
  nbSeances: number
): string {
  if (nbSeances <= 0) return dateDebut;
  const joursNums = toJoursNums(joursFixe);
  let count = 0;
  const current = new Date(dateDebut);
  while (count < nbSeances) {
    if (joursNums.has(current.getDay())) count++;
    if (count < nbSeances) current.setDate(current.getDate() + 1);
  }
  return current.toISOString().split('T')[0];
}

// Estimation du nombre de séances sur une période, à partir d'une fréquence
// hebdomadaire (et non plus de jours fixes) — utilisée pour nombreSeancesTotal
// et le récapitulatif du formulaire de contrat.
export function calculerNbSeancesEstime(
  dateDebut: string,
  dateFin: string,
  nbSeancesSemaine: number
): number {
  const jours = Math.max(0, (new Date(dateFin).getTime() - new Date(dateDebut).getTime()) / 86_400_000) + 1;
  return Math.max(0, Math.round((jours / 7) * nbSeancesSemaine));
}

// Date de fin approximative pour atteindre nbSeances séances à une fréquence
// donnée (mode "nombre de séances prescrites" du formulaire de contrat).
export function calculerDateFinParFrequence(
  dateDebut: string,
  nbSeancesSemaine: number,
  nbSeances: number
): string {
  if (nbSeances <= 0 || nbSeancesSemaine <= 0) return dateDebut;
  const nbSemaines = Math.ceil(nbSeances / nbSeancesSemaine);
  const d = new Date(dateDebut);
  d.setDate(d.getDate() + nbSemaines * 7 - 1);
  return d.toISOString().split('T')[0];
}

// dateAncrage : semaine de référence pour le cycle de périodicité (2/3
// semaines). Par défaut égale à dateDebut, mais peut être fournie séparément
// quand la génération démarre plus tard que le vrai début du contrat (ex :
// on ne génère qu'à partir d'aujourd'hui un contrat commencé il y a
// plusieurs semaines) — sans ça, le cycle bimensuel/trimestriel se
// décalerait par rapport aux séances déjà générées pour ce même contrat.
export function genererDatesSeances(
  dateDebut: string,
  dateFin: string,
  joursFixe: string | string[],
  periodicite: PeriodiciteContrat = 'semaine',
  dateAncrage: string = dateDebut
): string[] {
  const joursNums = toJoursNums(joursFixe);
  const dates: string[] = [];
  const current = new Date(dateDebut);
  const fin = new Date(dateFin);
  while (current <= fin) {
    const dateStr = current.toISOString().split('T')[0];
    if (joursNums.has(current.getDay()) && estSemaineDue(dateAncrage, dateStr, periodicite)) {
      dates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function lundiDeLaSemaine(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00');
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return d.toISOString().split('T')[0];
}

export const CYCLE_SEMAINES: Record<PeriodiciteContrat, number> = {
  semaine: 1, deux_semaines: 2, trois_semaines: 3,
};

// Marge tampon entre la fin d'une séance et le début de la suivante (en plus du trajet)
export const MARGE_ENTRE_SEANCES_MIN = 10;

// Le cycle (toutes les 2/3 semaines) est ancré sur la semaine de dateDebut,
// de façon fixe : si une semaine due est ratée (patient indisponible), le
// cycle continue sur sa cadence normale plutôt que de "rattraper" la séance
// manquée. Utilisé à la fois pour la génération initiale des séances
// (genererDatesSeances) et par le planificateur de tournée semaine par
// semaine (src/lib/planificateur.ts).
export function estSemaineDue(
  dateDebut: string,
  dateCible: string,
  periodicite: PeriodiciteContrat = 'semaine'
): boolean {
  const cycle = CYCLE_SEMAINES[periodicite];
  if (cycle <= 1) return true;
  const lundiDebut = lundiDeLaSemaine(dateDebut);
  const lundiCible = lundiDeLaSemaine(dateCible);
  const diffJours = Math.round(
    (new Date(lundiCible + 'T12:00').getTime() - new Date(lundiDebut + 'T12:00').getTime()) / 86_400_000
  );
  const semaineIndex = Math.round(diffJours / 7);
  return ((semaineIndex % cycle) + cycle) % cycle === 0;
}

// Pour des dates déjà triées chronologiquement (ex : genererDatesSeances),
// renvoie le rang 0-based de chaque date au sein de sa semaine (lundi-dimanche)
// — utilisé pour appliquer une durée individuelle par séance de la semaine
// (Contrat.dureesSeances : séance 1, séance 2...).
export function indexerParSemaine(dates: string[]): number[] {
  const compteurParSemaine = new Map<string, number>();
  return dates.map(date => {
    const semaine = lundiDeLaSemaine(date);
    const i = compteurParSemaine.get(semaine) ?? 0;
    compteurParSemaine.set(semaine, i + 1);
    return i;
  });
}

// ── Séances restant à planifier (indicateur carte bénéficiaire) ──────────────

export type StatutSeancesSemaine =
  | { etat: 'sans_contrat' }
  | { etat: 'nb_non_defini' }
  // Semaine hors cycle d'un contrat "1 semaine sur 2/3" : 0 séance prévue,
  // à ne pas confondre visuellement avec "complet" (rien n'était à planifier).
  | { etat: 'semaine_non_due' }
  | { etat: 'complet'; prevu: number; planifie: number }
  | { etat: 'a_planifier'; prevu: number; planifie: number; restant: number };

// dateReference : n'importe quel jour de la semaine à évaluer (par défaut
// aujourd'hui). Compare le nombre de séances prévues par le contrat actif
// (contrat.nbSeancesSemaine, uniquement si la semaine est due pour sa
// périodicité) au nombre de séances déjà placées dans l'agenda cette
// semaine-là (lundi → dimanche, tout statut sauf 'annulee').
export function calculerStatutSeancesSemaine(
  contrat: Contrat | null,
  seances: Seance[],
  dateReference: string = new Date().toISOString().split('T')[0],
): StatutSeancesSemaine {
  if (!contrat) return { etat: 'sans_contrat' };
  const prevu = contrat.nbSeancesSemaine;
  if (!prevu || prevu <= 0) return { etat: 'nb_non_defini' };

  const periodicite = contrat.periodicite ?? 'semaine';
  if (!estSemaineDue(contrat.dateDebut, dateReference, periodicite)) {
    return { etat: 'semaine_non_due' };
  }

  const lundi = lundiDeLaSemaine(dateReference);
  const dimanche = new Date(lundi + 'T12:00');
  dimanche.setDate(dimanche.getDate() + 6);
  const dimancheStr = dimanche.toISOString().split('T')[0];

  const planifie = seances.filter(s =>
    s.participantId === contrat.participantId &&
    s.statut !== 'annulee' &&
    s.date >= lundi && s.date <= dimancheStr
  ).length;

  const restant = prevu - planifie;
  if (restant <= 0) return { etat: 'complet', prevu, planifie };
  return { etat: 'a_planifier', prevu, planifie, restant };
}
