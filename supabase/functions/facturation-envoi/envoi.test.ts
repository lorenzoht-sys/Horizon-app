import { describe, expect, it } from 'vitest';
import { composerMessage, destinataire, emailValide, erreurCourte, nomExpediteur, nomPieceJointe, sujet, texte, type FactureEnvoi } from './envoi';

// Données entièrement fictives.
const f = (s: Partial<FactureEnvoi> = {}): FactureEnvoi => ({
  numero: '2026-0008', type: 'facture', periode: '2026-09-01', total: 242, echeance: '2026-11-20',
  emetteur: { societe: "Mouv'APA", prenom: 'Alex', nom: 'Exemple', email: 'praticien@example.com' },
  destinataire: { email: 'destinataire@example.com' }, ...s,
});

describe('envoi d\'une facture : composition', () => {
  it('expéditeur : nom commercial, sinon prénom + nom ; caractères dangereux retirés', () => {
    expect(nomExpediteur(f().emetteur)).toBe("Mouv'APA");
    expect(nomExpediteur({ societe: '  ', prenom: 'Alex', nom: 'Exemple' })).toBe('Alex Exemple');
    expect(nomExpediteur({ societe: 'A "B" <c>\r\nBcc: x' })).toBe('A B c Bcc: x');
    expect(nomExpediteur({})).toBe('Horizon');
  });
  it('destinataire : saisie prioritaire si valide ; sinon adresse figée ; sinon manquant', () => {
    expect(destinataire(f(), 'autre@example.com')).toEqual({ email: 'autre@example.com' });
    expect(destinataire(f(), 'pas une adresse')).toEqual({ invalide: true });
    expect(destinataire(f())).toEqual({ email: 'destinataire@example.com' });
    expect(destinataire(f({ destinataire: { email: null } }))).toEqual({ manquant: true });
    expect(destinataire(f({ destinataire: { email: 'invalide' } }), '  ')).toEqual({ manquant: true });
  });
  it('sujet, corps et pièce jointe : numéro, période, montant, échéance ; rien de nominatif dans le fichier', () => {
    expect(sujet(f())).toBe('Facture n° 2026-0008 — septembre 2026');
    expect(sujet(f({ type: 'avoir' }))).toBe('Avoir n° 2026-0008 — septembre 2026');
    expect(texte(f())).toContain("d'un montant de 242,00 €.");
    expect(texte(f())).toContain('Échéance de paiement : 20/11/2026.');
    expect(texte(f({ type: 'avoir' }))).not.toContain('Échéance');
    expect(texte(f())).toContain("Cordialement,\nMouv'APA");
    expect(nomPieceJointe(f())).toBe('facture-2026-0008.pdf');
  });
  it('message Resend : From entre guillemets, Répondre à = e-mail du praticien, PDF joint', () => {
    const m = composerMessage(f(), 'destinataire@example.com', 'JVBERi0=', 'factures@horizon-suivi.fr');
    expect(m).toMatchObject({
      from: '"Mouv\'APA" <factures@horizon-suivi.fr>', to: ['destinataire@example.com'], reply_to: 'praticien@example.com',
      attachments: [{ filename: 'facture-2026-0008.pdf', content: 'JVBERi0=' }],
    });
    expect(composerMessage(f({ emetteur: { prenom: 'A', email: null } }), 'd@example.com', 'x', 'f@h.fr')).not.toHaveProperty('reply_to');
  });
  it('formes d\'adresse et erreurs courtes', () => {
    expect(emailValide('a@b.fr')).toBe(true);
    for (const v of ['a@b', 'a b@c.fr', '', null, `${'a'.repeat(250)}@b.fr`]) expect(emailValide(v)).toBe(false);
    expect(erreurCourte('x'.repeat(900))).toHaveLength(500);
    expect(erreurCourte(new Error('boom'))).toBe('boom');
  });
});
