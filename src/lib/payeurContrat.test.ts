import { describe, expect, it } from 'vitest';
import { lirePayeur, messagePayeurLisible, payeurVersMiseAJour, resumePayeur, validerPayeur, type FormulairePayeur } from './payeurContrat';

// Données fictives.
const proche: FormulairePayeur = { type: 'proche', nom: 'Dominique Test', adresse: '3 rue Fictive\n69000 Lyon-Test', email: 'proche@example.com' };

describe('lirePayeur', () => {
  it('bénéficiaire par défaut ; proche relu tel quel', () => {
    expect(lirePayeur(null)).toEqual({ type: 'beneficiaire', nom: '', adresse: '', email: '' });
    expect(lirePayeur({ payeur_type: 'x' }).type).toBe('beneficiaire');
    expect(lirePayeur({ payeur_type: 'proche', payeur_nom: 'Dominique Test', payeur_adresse: '3 rue Fictive\n69000 Lyon-Test', payeur_email: 'proche@example.com' })).toEqual(proche);
  });
});

describe('validerPayeur (mêmes règles que les contraintes de la base)', () => {
  it('bénéficiaire : rien à saisir', () => {
    expect(validerPayeur({ type: 'beneficiaire', nom: '', adresse: '', email: '' })).toEqual({});
  });
  it('proche : nom, adresse et e-mail requis ; e-mail au bon format', () => {
    expect(validerPayeur(proche)).toEqual({});
    expect(Object.keys(validerPayeur({ ...proche, nom: ' ', adresse: '', email: '' })).sort()).toEqual(['adresse', 'email', 'nom']);
    for (const email of ['a', 'a@b', 'a b@c.fr', '@c.fr']) expect(validerPayeur({ ...proche, email }).email, email).toBeDefined();
  });
});

describe('payeurVersMiseAJour', () => {
  it('proche : valeurs nettoyées, lignes vides de l\'adresse retirées', () => {
    expect(payeurVersMiseAJour({ ...proche, nom: ' Dominique Test ', adresse: ' 3 rue Fictive \n\n 69000 Lyon-Test ', email: ' proche@example.com ' }))
      .toEqual({ payeur_type: 'proche', payeur_nom: 'Dominique Test', payeur_adresse: '3 rue Fictive\n69000 Lyon-Test', payeur_email: 'proche@example.com' });
  });
  it('retour au bénéficiaire : coordonnées du proche effacées', () => {
    expect(payeurVersMiseAJour({ ...proche, type: 'beneficiaire' })).toEqual({ payeur_type: 'beneficiaire', payeur_nom: null, payeur_adresse: null, payeur_email: null });
  });
  it('n\'écrit que les colonnes du payeur', () => {
    expect(Object.keys(payeurVersMiseAJour(proche)).sort()).toEqual(['payeur_adresse', 'payeur_email', 'payeur_nom', 'payeur_type']);
  });
});

describe('messages et résumé', () => {
  it('traduit les contraintes de la base', () => {
    expect(messagePayeurLisible('violates check constraint "contrats_proche_requiert_coordonnees"')).toMatch(/nom, une adresse et un e-mail/);
    expect(messagePayeurLisible('violates check constraint "contrats_payeur_email_format"')).toBe('Adresse e-mail invalide.');
    expect(messagePayeurLisible('autre')).toBe('autre');
  });
  it('résumé replié', () => {
    expect(resumePayeur(proche)).toBe('Dominique Test (proche) · proche@example.com');
    expect(resumePayeur({ ...proche, type: 'beneficiaire' })).toBe('Le bénéficiaire');
  });
});
