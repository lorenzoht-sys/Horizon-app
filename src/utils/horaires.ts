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

export const PLAGES = {
  matin:       { debut: '08:00', fin: '12:00', label: 'Matin (8h-12h)' },
  'apres-midi': { debut: '13:30', fin: '18:00', label: 'Après-midi (13h30-18h)' },
  soiree:      { debut: '18:00', fin: '21:00', label: 'Soirée (18h-21h)' },
} as const;

const JOURS_NUM: Record<string, number> = {
  lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6,
};

export const LABELS_JOURS_COURT: Record<string, string> = {
  lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam',
};

export const LABELS_JOURS_LONG: Record<string, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi',
  jeu: 'Jeudi', ven: 'Vendredi', sam: 'Samedi',
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

export function genererDatesSeances(
  dateDebut: string,
  dateFin: string,
  joursFixe: string | string[]
): string[] {
  const joursNums = toJoursNums(joursFixe);
  const dates: string[] = [];
  const current = new Date(dateDebut);
  const fin = new Date(dateFin);
  while (current <= fin) {
    if (joursNums.has(current.getDay())) {
      dates.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function lundiDeLaSemaine(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00');
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return d.toISOString().split('T')[0];
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
