// Cours collectifs côté ESPACE BÉNÉFICIAIRE : sélection et libellés, en fonctions
// pures. Les données arrivent de /api/patient/me, déjà filtrées côté serveur
// (api/_lib/coursPatient.ts) : pas de note du praticien, pas de facturation, et une
// présence seulement sur un cours réalisé. Ce module ne fait que présenter.

export type PresenceCoursPatient = 'present' | 'absent' | 'excuse';
export type StatutCoursPatient = 'planifie' | 'realise' | 'annule';
export type ReponseAnnonceeCours = 'vient' | 'ne_vient_pas';

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
  return cours
    .filter(c => c.statut === 'planifie' && c.date >= aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date) || a.heureDebut.localeCompare(b.heureDebut))[0] ?? null;
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
