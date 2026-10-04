// Libellés du bouton de signalement d'absence de l'espace bénéficiaire
// (BoutonSignalementAbsence, src/pages/EspacePatient.tsx).
//
// Retour terrain 2026-10 : « 🚫 Je ne serai pas disponible » a été lu par une
// patiente comme un message du praticien annonçant qu'il ne viendrait pas.
// Le libellé nomme l'action du bénéficiaire et son destinataire, par son
// prénom (renvoyé par /api/patient/me) ou, à défaut, « mon praticien ».
// Confirmation formulée sans accord (« Absence signalée à … ») pour ne pas
// présumer du genre du praticien.

export interface LibellesSignalementAbsence {
  bouton: string;
  annuler: string;
  confirmation: string;
}

export function libellesSignalementAbsence(praticienPrenom: string | null | undefined): LibellesSignalementAbsence {
  const prenom = praticienPrenom?.trim();
  return {
    bouton: prenom ? `Prévenir ${prenom} de mon absence` : 'Prévenir mon praticien de mon absence',
    annuler: 'Annuler mon signalement d’absence',
    confirmation: prenom ? `✓ Absence signalée à ${prenom}` : '✓ Absence signalée à votre praticien',
  };
}
