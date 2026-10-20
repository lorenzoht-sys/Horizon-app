// Suppression d'un bénéficiaire : message affiché quand la base la refuse (décision du 2026-10-20).
//
// La base refuse la suppression dès qu'il existe un historique financier (factures, avoirs, CA externe) :
// trigger participants_suppression_si_sans_historique_financier, migration 20261020100000. Son message est
// déjà rédigé pour le praticien et compté ; on le reprend tel quel. Une autre contrainte de clé étrangère
// (filet de sécurité) reçoit une phrase équivalente. Tout autre refus garde son texte, préfixé.

export interface ErreurBase {
  message: string;
  code?: string;
}

export function messageSuppressionBeneficiaire(erreur: ErreurBase): string {
  if (/historique financier/.test(erreur.message)) return erreur.message;
  if (erreur.code === '23503' || /violates foreign key constraint/.test(erreur.message)) {
    return 'Ce bénéficiaire a des données liées (factures, avoirs ou CA externe) : il ne peut pas être supprimé. Archivez-le à la place.';
  }
  return `Suppression impossible : ${erreur.message}`;
}
