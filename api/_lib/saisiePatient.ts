// Bornes des saisies libres envoyées par l'espace bénéficiaire (2026-11-12).
//
// Les routes /api/patient/* écrivent en service_role : aucune contrainte de
// la base ne borne la taille d'un commentaire ou la forme d'une date. Sans
// borne, un jeton patient valide suffisait à stocker plusieurs mégaoctets par
// requête dans le dossier (le corps accepté par Vercel va jusqu'à 4,5 Mo), et
// une date mal formée produisait une erreur 500 au lieu d'un refus propre.
//
// Les plafonds sont larges à dessein : ils arrêtent l'abus, pas l'usage. Un
// commentaire de séance tient en quelques lignes ; 5 000 caractères en
// laissent plus de cent.
//
// Dépassement REFUSÉ, jamais tronqué : même règle que api/_lib/guard.ts, un
// texte coupé en silence est une donnée fausse dans un dossier de santé.

export const TEXTE_PATIENT_MAX = 5_000;
export const EXERCICES_PAR_SEANCE_MAX = 200;
export const DUREE_SEANCE_MAX_MINUTES = 24 * 60;

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Vrai pour une date civile AAAA-MM-JJ qui existe (pas de 2026-02-31). */
export function dateCivileValide(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !DATE_ISO.test(valeur)) return false;
  const d = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

/** Vrai si la valeur est absente, ou un texte sous le plafond. */
export function texteDansLaBorne(valeur: unknown): boolean {
  if (valeur === undefined || valeur === null) return true;
  return typeof valeur === 'string' && valeur.length <= TEXTE_PATIENT_MAX;
}

export const MESSAGE_TEXTE_TROP_LONG = `Commentaire trop long (${TEXTE_PATIENT_MAX.toLocaleString('fr-FR')} caractères au maximum).`;
