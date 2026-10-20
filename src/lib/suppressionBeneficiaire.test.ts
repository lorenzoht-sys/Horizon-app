import { describe, expect, it } from 'vitest';
import { messageSuppressionBeneficiaire } from './suppressionBeneficiaire';

describe('messageSuppressionBeneficiaire', () => {
  it('reprend tel quel le refus compté de la base (historique financier)', () => {
    const message = 'Ce bénéficiaire a un historique financier (2 facture(s), 0 avoir(s), 1 saisie(s) de CA externe) : il ne peut pas être supprimé. Archivez-le à la place.';
    expect(messageSuppressionBeneficiaire({ message, code: '23503' })).toBe(message);
  });
  it('traduit une contrainte de clé étrangère brute en phrase utile', () => {
    expect(messageSuppressionBeneficiaire({ message: 'update or delete on table "participants" violates foreign key constraint "factures_participant_id_fkey" on table "factures"', code: '23503' }))
      .toBe('Ce bénéficiaire a des données liées (factures, avoirs ou CA externe) : il ne peut pas être supprimé. Archivez-le à la place.');
  });
  it('garde le texte de tout autre refus, préfixé', () => {
    expect(messageSuppressionBeneficiaire({ message: 'permission denied for table participants', code: '42501' })).toBe('Suppression impossible : permission denied for table participants');
  });
});
