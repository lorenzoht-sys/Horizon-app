import type { PeriodiciteContrat, Seance } from '../types';

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
