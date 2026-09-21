// Cours collectifs côté ESPACE BÉNÉFICIAIRE : sélection et libellés, en fonctions
// pures. Les données arrivent de /api/patient/me, déjà filtrées côté serveur
// (api/_lib/coursPatient.ts) : pas de note du praticien, pas de facturation, et une
// présence seulement sur un cours réalisé. Ce module ne fait que présenter.

export type PresenceCoursPatient = 'present' | 'absent' | 'excuse';
export type StatutCoursPatient = 'planifie' | 'realise' | 'annule';
export type ReponseAnnonceeCours = 'vient' | 'ne_vient_pas';

/** Nombre de prochains cours pour lesquels le bénéficiaire peut répondre (décidé : 4). */
export const NB_COURS_A_REPONDRE = 4;

/** Miroir du DTO de api/_lib/coursPatient.ts (le client n'importe pas le code serveur). */
export interface CoursPatientRecord {
  coursId: string;
  titre: string;
  date: string;
  heureDebut: string;
  dureeMinutes: number;
  statut: StatutCoursPatient;
  presence: PresenceCoursPatient | null;
  ressentiBorg: number | null;
  ressentiBienetre: number | null;
  /** Ce que le bénéficiaire a ANNONCÉ (distinct de `presence`, constatée par le praticien). null = pas de réponse. */
  presenceAnnoncee: ReponseAnnonceeCours | null;
}

/** Jour local AAAA-MM-JJ (et non UTC : un cours de 00h30 ne doit pas compter pour la veille). */
export function jourLocal(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE');
}

/**
 * Le prochain cours à venir : planifié, aujourd'hui ou plus tard, le plus proche.
 * (Même règle que « prochain rendez-vous » : la date compte, pas l'heure.)
 */
export function prochainCours(cours: CoursPatientRecord[], aujourdhui: string): CoursPatientRecord | null {
  return prochainsCours(cours, aujourdhui, 1)[0] ?? null;
}

/**
 * Les prochains cours à venir (planifiés, aujourd'hui ou plus tard), du plus proche au plus
 * lointain, au plus `n` : ceux auxquels le bénéficiaire peut répondre « Je viens / Je ne
 * viens pas ». Un groupe hebdomadaire peut vouloir répondre plusieurs semaines à l'avance.
 */
export function prochainsCours(cours: CoursPatientRecord[], aujourdhui: string, n: number = NB_COURS_A_REPONDRE): CoursPatientRecord[] {
  return cours
    .filter(c => c.statut === 'planifie' && c.date >= aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))
    .slice(0, n);
}

/**
 * L'historique : les cours réalisés et les cours annulés (le bénéficiaire doit
 * savoir qu'un cours n'a pas eu lieu), du plus récent au plus ancien. Un cours
 * encore planifié n'en fait pas partie — ni un cours planifié dont la date est
 * passée : il n'est ni fait ni annulé, le praticien ne l'a pas clôturé.
 */
export function historiqueCours(cours: CoursPatientRecord[]): CoursPatientRecord[] {
  return cours
    .filter(c => c.statut === 'realise' || c.statut === 'annule')
    .sort((a, b) => b.date.localeCompare(a.date) || b.heureDebut.localeCompare(a.heureDebut));
}

export const LIBELLE_PRESENCE_PATIENT: Record<PresenceCoursPatient, string> = {
  present: 'Présent',
  absent: 'Absent',
  excuse: 'Excusé',
};

// ── Ouverture des réponses : jusqu'au DÉBUT du cours ───────────────────────

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Décalage Europe/Paris ↔ UTC, en minutes, à l'instant donné (CET/CEST gérés). */
function decalageParisMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') parts[p.type] = p.value;
  const heure = parts.hour === '24' ? '00' : parts.hour;
  const enUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(heure), Number(parts.minute), Number(parts.second));
  return Math.round((enUTC - date.getTime()) / 60_000);
}

/**
 * Instant de début d'un cours (ms depuis l'epoch), date + heure civiles EUROPE/PARIS, ou null
 * si la date est inexploitable. Heure inexploitable : 23h59 de ce jour-là.
 *
 * MIROIR de instantDebutCours (api/_lib/presenceAnnoncee.ts) : le SERVEUR fait foi, il refuse
 * toute réponse tardive. Ce calcul ne sert qu'à ne plus proposer les boutons au bon moment,
 * sans dépendre du fuseau du téléphone. Les tests de ce fichier reprennent les mêmes cas que
 * ceux du serveur, pour que les deux ne divergent pas.
 */
export function debutCoursParis(date: string, heureDebut: string): number | null {
  if (!DATE_ISO.test(date)) return null;
  const heure = HEURE.test(heureDebut) ? heureDebut : '23:59';
  const [annee, mois, jour] = date.split('-').map(Number);
  const [h, m] = heure.split(':').map(Number);
  const approx = new Date(Date.UTC(annee, mois - 1, jour, h, m, 0));
  if (Number.isNaN(approx.getTime())) return null;
  return approx.getTime() - decalageParisMinutes(approx) * 60_000;
}

/**
 * Le bénéficiaire peut-il encore répondre ? Cours planifié ET instant présent STRICTEMENT
 * avant son début (aucune tolérance, comme le serveur).
 */
export function reponseEncoreOuverte(cours: CoursPatientRecord, maintenantMs: number): boolean {
  if (cours.statut !== 'planifie') return false;
  const debut = debutCoursParis(cours.date, cours.heureDebut);
  return debut !== null && maintenantMs < debut;
}
