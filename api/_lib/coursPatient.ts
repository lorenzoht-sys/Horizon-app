// Cours collectifs tels que le BÉNÉFICIAIRE les voit (api/patient/me.ts).
//
// Route en service_role : la RLS est contournée, rien ne rattrape une colonne de
// trop. D'où deux garde-fous, comme pour seances (colonnesSeancesExposees.ts) :
//
// 1. Colonnes listées EXPLICITEMENT, jamais select('*'). EXCLUES :
//    - participations_cours_collectifs.notes : note libre du praticien. Même
//      défaut que seances.notes (17 notes exposées en production, corrigé par
//      la PR #68) — elle est INTERNE, pour toujours ;
//    - participant_id, programme_individuel_id, created_at : rien à en faire ;
//    - cours_collectifs.praticien_id, structure_id, mode_facturation,
//      programme_commun_id, created_at : facturation et organisation internes.
// 2. Le DTO est construit champ par champ (aucun spread de la ligne brute) :
//    une colonne ajoutée plus tard à la requête ne sortirait pas pour autant.
//
// Aucune donnée d'un autre bénéficiaire : la requête filtre sur le
// participant_id du JWT, et un cours n'est lu que par sa propre participation.

export const COLONNES_PARTICIPATION_PATIENT = 'statut_presence, ressenti_borg, ressenti_bienetre';
export const COLONNES_COURS_PATIENT = 'id, titre, date, heure_debut, duree_minutes, statut';
/** Participation + son cours (jointure PostgREST, colonnes explicites des deux côtés). */
export const SELECT_COURS_PATIENT = `${COLONNES_PARTICIPATION_PATIENT}, cours_collectifs(${COLONNES_COURS_PATIENT})`;

/** Garde-fou de volume : un groupe hebdomadaire sur plusieurs années reste bien en dessous. */
export const LIMITE_COURS_PATIENT = 100;

export type PresenceCoursPatient = 'present' | 'absent' | 'excuse';
export type StatutCoursPatient = 'planifie' | 'realise' | 'annule';

export interface CoursPatient {
  coursId: string;
  titre: string;
  date: string;
  heureDebut: string;
  dureeMinutes: number;
  statut: StatutCoursPatient;
  /** Présence CONSTATÉE. null tant que le cours n'est pas réalisé (voir ci-dessous). */
  presence: PresenceCoursPatient | null;
  ressentiBorg: number | null;
  ressentiBienetre: number | null;
}

const STATUTS: readonly string[] = ['planifie', 'realise', 'annule'];
const PRESENCES: readonly string[] = ['present', 'absent', 'excuse'];

function nombreOuNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Transforme les lignes « participation + cours » en DTO pour le bénéficiaire.
 *
 * Deux règles de MASQUAGE, côté serveur (pas seulement à l'affichage) :
 *  - la présence n'est envoyée que pour un cours RÉALISÉ. statut_presence vaut
 *    « present » PAR DÉFAUT dès l'inscription : sur un cours à venir ou annulé,
 *    ce « présent » n'a jamais été constaté par personne ;
 *  - l'effort perçu et le bien-être ne sont envoyés que pour un cours réalisé où
 *    le bénéficiaire était présent : la saisie ne les propose qu'à un présent, et
 *    une valeur restée après un passage à « absent » n'aurait aucun sens.
 */
export function construireCoursPatient(lignes: unknown[]): CoursPatient[] {
  const resultat: CoursPatient[] = [];

  for (const brute of lignes) {
    if (!brute || typeof brute !== 'object') continue;
    const ligne = brute as Record<string, unknown>;

    // PostgREST renvoie un objet pour une relation « plusieurs-à-un », mais on
    // tolère un tableau plutôt que de perdre le cours.
    const cours = (Array.isArray(ligne.cours_collectifs) ? ligne.cours_collectifs[0] : ligne.cours_collectifs) as
      Record<string, unknown> | null | undefined;
    // Cours introuvable (supprimé, illisible) : rien à afficher, pas une erreur.
    if (!cours || typeof cours !== 'object') continue;

    if (typeof cours.id !== 'string' || typeof cours.titre !== 'string' || typeof cours.date !== 'string') continue;
    if (typeof cours.statut !== 'string' || !STATUTS.includes(cours.statut)) continue;
    const statut = cours.statut as StatutCoursPatient;

    const presence = statut === 'realise' && typeof ligne.statut_presence === 'string' && PRESENCES.includes(ligne.statut_presence)
      ? (ligne.statut_presence as PresenceCoursPatient)
      : null;
    const avecRessenti = statut === 'realise' && presence === 'present';

    // Construit champ par champ : aucune autre clé de `ligne` ou de `cours` ne passe.
    resultat.push({
      coursId: cours.id,
      titre: cours.titre,
      date: cours.date,
      heureDebut: typeof cours.heure_debut === 'string' ? cours.heure_debut : '',
      dureeMinutes: nombreOuNull(cours.duree_minutes) ?? 0,
      statut,
      presence,
      ressentiBorg: avecRessenti ? nombreOuNull(ligne.ressenti_borg) : null,
      ressentiBienetre: avecRessenti ? nombreOuNull(ligne.ressenti_bienetre) : null,
    });
  }

  return resultat
    .sort((a, b) => b.date.localeCompare(a.date) || b.heureDebut.localeCompare(a.heureDebut))
    .slice(0, LIMITE_COURS_PATIENT);
}
