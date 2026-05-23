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
