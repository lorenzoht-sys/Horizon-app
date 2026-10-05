import { describe, it, expect } from 'vitest';
import {
  FORMULAIRE_VIDE,
  champsManquantsPourValider,
  formaterIban,
  formulaireVersMiseAJour,
  ibanFormeValide,
  lireFormulaire,
  lireIdentite,
  messageEnregistrementLisible,
  normaliserIban,
  siretAAlerter,
  validerFormulaire,
  type FormulaireFacturation,
  type IdentiteProfil,
} from './profilFacturation';

const identite: IdentiteProfil = {
  nom: 'Dupont', siret: '73282932000074', numeroSap: 'SAP000000000', numeroTva: '',
  adresseRue: '1 rue Test', adresseCodePostal: '00000', adresseVille: 'Villetest',
};
const franchise: FormulaireFacturation = { ...FORMULAIRE_VIDE, regimeTva: 'franchise_293B' };
const assujetti = (taux: string, agrement = false): FormulaireFacturation =>
  ({ ...FORMULAIRE_VIDE, regimeTva: 'assujetti', tauxTva: taux, agrementSap: agrement });

describe('lecture de la ligne praticiens', () => {
  it('une ligne vide donne un formulaire vide avec le délai par défaut de 30 jours', () => {
    expect(lireFormulaire(null)).toEqual(FORMULAIRE_VIDE);
    expect(lireFormulaire({})).toMatchObject({ regimeTva: '', tauxTva: '', agrementSap: false, delaiPaiementJours: '30' });
  });
  it('lit tous les champs, le taux numeric revenant en texte du sélecteur', () => {
    const f = lireFormulaire({
      regime_tva: 'assujetti', taux_tva: '5.50', agrement_sap: true, date_declaration_sap: '2026-03-04',
      mode_intervention: 'mandataire', adresse_intervention: '2 rue B', facturation_adresse_rue: '3 rue C',
      facturation_code_postal: '00001', facturation_ville: 'Ailleurs', iban: 'FR7630006000011234567890189',
      delai_paiement_jours: 45, penalites_retard: 'Pénalités légales',
    });
    expect(f).toEqual({
      regimeTva: 'assujetti', tauxTva: '5.5', agrementSap: true, dateDeclarationSap: '2026-03-04',
      modeIntervention: 'mandataire', adresseIntervention: '2 rue B', facturationRue: '3 rue C',
      facturationCodePostal: '00001', facturationVille: 'Ailleurs', iban: 'FR7630006000011234567890189',
      delaiPaiementJours: '45', penalitesRetard: 'Pénalités légales',
    });
    expect(lireFormulaire({ regime_tva: 'assujetti', taux_tva: 10 }).tauxTva).toBe('10');
    expect(lireFormulaire({ regime_tva: 'franchise_293B', taux_tva: 0 }).tauxTva).toBe('');
    expect(lireFormulaire({ regime_tva: 'n_importe_quoi', mode_intervention: 'x' })).toMatchObject({ regimeTva: '', modeIntervention: '' });
  });
  it('lit le rappel d\'identité', () => {
    expect(lireIdentite({ nom: 'D', siret: 'S', numero_sap: 'SAP', numero_tva: 'FR1', adresse_rue: 'r', adresse_code_postal: 'c', adresse_ville: 'v' }))
      .toEqual({ nom: 'D', siret: 'S', numeroSap: 'SAP', numeroTva: 'FR1', adresseRue: 'r', adresseCodePostal: 'c', adresseVille: 'v' });
    expect(lireIdentite(null).siret).toBe('');
  });
});

describe('IBAN : forme seulement', () => {
  it('normalise (majuscules, sans espaces) comme le trigger de la base', () => {
    expect(normaliserIban(' fr76 3000 6000 0112 3456 7890 189 ')).toBe('FR7630006000011234567890189');
    expect(formaterIban('FR7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189');
  });
  it('accepte la forme, avec ou sans espaces, minuscules comprises', () => {
    expect(ibanFormeValide('FR76 3000 6000 0112 3456 7890 189')).toBe(true);
    expect(ibanFormeValide('fr7630006000011234567890189')).toBe(true);
    expect(ibanFormeValide('DE89370400440532013000')).toBe(true);
  });
  it('refuse une forme fausse (pas de vérification de clé, comme demandé)', () => {
    for (const mauvais of ['123', 'FR76', 'FR7630006000', '7630006000011234567890189', 'FR76-3000-6000-0112', 'FR7630006000011234567890189' + 'X'.repeat(30)]) {
      expect(ibanFormeValide(mauvais), mauvais).toBe(false);
    }
  });
});

describe('validerFormulaire : contraintes de TVA', () => {
  it('franchise : aucun taux demandé, aucune erreur', () => {
    expect(validerFormulaire(franchise)).toEqual({});
    expect(validerFormulaire({ ...franchise, tauxTva: '10' })).toEqual({});   // ignoré à l'écriture, voir formulaireVersMiseAJour
  });
  it('assujetti : le taux est obligatoire, 10 % toujours permis', () => {
    expect(validerFormulaire(assujetti('')).tauxTva).toMatch(/5,5 % ou 10 %/);
    expect(validerFormulaire(assujetti('10'))).toEqual({});
    expect(validerFormulaire(assujetti('7')).tauxTva).toBeDefined();           // hors 5,5 / 10
    expect(validerFormulaire(assujetti('0')).tauxTva).toBeDefined();
  });
  it('5,5 % impossible sans agrément SAP, permis avec', () => {
    expect(validerFormulaire(assujetti('5.5', false)).tauxTva).toMatch(/agrément SAP/);
    expect(validerFormulaire(assujetti('5.5', true))).toEqual({});
  });
});

describe('validerFormulaire : formes', () => {
  it('délai de paiement : entier de 0 à 60', () => {
    for (const bon of ['0', '30', '60']) expect(validerFormulaire({ ...franchise, delaiPaiementJours: bon }).delaiPaiementJours, bon).toBeUndefined();
    for (const mauvais of ['', '61', '-1', '3.5', 'abc', '1e1']) expect(validerFormulaire({ ...franchise, delaiPaiementJours: mauvais }).delaiPaiementJours, mauvais).toBeDefined();
  });
  it('IBAN : vide permis (facultatif), mal formé refusé', () => {
    expect(validerFormulaire({ ...franchise, iban: '' }).iban).toBeUndefined();
    expect(validerFormulaire({ ...franchise, iban: 'FR76 3000 6000 0112 3456 7890 189' }).iban).toBeUndefined();
    expect(validerFormulaire({ ...franchise, iban: 'pas un iban' }).iban).toMatch(/IBAN invalide/);
  });
  it('adresse de facturation : tout ou rien, jamais partielle', () => {
    expect(validerFormulaire({ ...franchise }).facturationRue).toBeUndefined();
    expect(validerFormulaire({ ...franchise, facturationRue: '3 rue C', facturationCodePostal: '00001', facturationVille: 'V' }).facturationRue).toBeUndefined();
    expect(validerFormulaire({ ...franchise, facturationRue: '3 rue C' }).facturationRue).toMatch(/code postal, ville/);
    expect(validerFormulaire({ ...franchise, facturationVille: 'V', facturationCodePostal: ' ' }).facturationRue).toMatch(/rue, code postal/);
  });
  it('date de déclaration : AAAA-MM-JJ ou vide', () => {
    expect(validerFormulaire({ ...franchise, dateDeclarationSap: '' }).dateDeclarationSap).toBeUndefined();
    expect(validerFormulaire({ ...franchise, dateDeclarationSap: '2026-03-04' }).dateDeclarationSap).toBeUndefined();
    expect(validerFormulaire({ ...franchise, dateDeclarationSap: '04/03/2026' }).dateDeclarationSap).toBeDefined();
  });
});

describe('champsManquantsPourValider : mêmes exigences que valider_facture', () => {
  it('identité complète + régime choisi : plus rien ne manque', () => {
    expect(champsManquantsPourValider(identite, franchise)).toEqual([]);
    expect(champsManquantsPourValider(identite, assujetti('10'))).toEqual([]);
  });
  it('sans régime de TVA : signalé ICI, avant tout enregistrement', () => {
    expect(champsManquantsPourValider(identite, FORMULAIRE_VIDE)).toEqual([{ libelle: 'Régime de TVA', ou: 'ici', champ: 'regimeTva' }]);
  });
  it('SIRET et nom manquants : à corriger dans Paramètres', () => {
    const m = champsManquantsPourValider({ ...identite, siret: ' ', nom: '' }, franchise);
    expect(m.map(x => [x.libelle, x.ou])).toEqual([['SIRET (dans Paramètres)', 'parametres'], ['Nom (dans Paramètres)', 'parametres']]);
  });
  it('adresse : l\'adresse professionnelle suffit ; sans elle, l\'adresse de facturation doit être complète', () => {
    const sansAdresse = { ...identite, adresseRue: '', adresseCodePostal: '', adresseVille: '' };
    expect(champsManquantsPourValider(sansAdresse, franchise).map(x => x.champ)).toEqual(['facturationRue']);
    expect(champsManquantsPourValider(sansAdresse, { ...franchise, facturationRue: '3 rue', facturationCodePostal: '00001', facturationVille: 'V' })).toEqual([]);
    // Adresse de facturation PARTIELLE : le champ vide retombe sur le profil (NULL), mais comme le
    // formulaire l'enregistrera à NULL, le résultat est le même que le serveur verra.
    expect(champsManquantsPourValider(identite, { ...franchise, facturationRue: '3 rue' })).toEqual([]);
  });
  it('assujetti sans taux : signalé (la base refuserait l\'enregistrement)', () => {
    expect(champsManquantsPourValider(identite, assujetti('')).map(x => x.champ)).toEqual(['tauxTva']);
  });
  it('IBAN, pénalités, agrément, mentions SAP : facultatifs, jamais signalés', () => {
    expect(champsManquantsPourValider(identite, { ...franchise, iban: '', penalitesRetard: '', agrementSap: false, modeIntervention: '' })).toEqual([]);
  });
});

describe('formulaireVersMiseAJour : ce qui part vers la base', () => {
  it('ne contient que les colonnes de facturation, jamais l\'identité', () => {
    expect(Object.keys(formulaireVersMiseAJour(franchise)).sort()).toEqual([
      'adresse_intervention', 'agrement_sap', 'date_declaration_sap', 'delai_paiement_jours',
      'facturation_adresse_rue', 'facturation_code_postal', 'facturation_ville', 'iban',
      'mode_intervention', 'penalites_retard', 'regime_tva', 'taux_tva',
    ]);
  });
  it('franchise : taux NULL même si un taux traînait dans le formulaire', () => {
    expect(formulaireVersMiseAJour({ ...franchise, tauxTva: '10' })).toMatchObject({ regime_tva: 'franchise_293B', taux_tva: null });
  });
  it('assujetti : taux numérique', () => {
    expect(formulaireVersMiseAJour(assujetti('5.5', true))).toMatchObject({ regime_tva: 'assujetti', taux_tva: 5.5, agrement_sap: true });
    expect(formulaireVersMiseAJour(assujetti('10'))).toMatchObject({ taux_tva: 10, agrement_sap: false });
  });
  it('toute valeur vide devient NULL, jamais \'\' (une chaîne vide masquerait l\'adresse du profil)', () => {
    const m = formulaireVersMiseAJour({ ...FORMULAIRE_VIDE, facturationRue: '  ', iban: ' ', penalitesRetard: '', adresseIntervention: ' ', dateDeclarationSap: '' });
    for (const cle of ['regime_tva', 'facturation_adresse_rue', 'facturation_code_postal', 'facturation_ville', 'iban', 'penalites_retard', 'adresse_intervention', 'date_declaration_sap', 'mode_intervention']) {
      expect(m[cle], cle).toBeNull();
    }
    expect(Object.values(m).includes('')).toBe(false);
  });
  it('normalise l\'IBAN, nettoie les espaces, convertit le délai en nombre', () => {
    const m = formulaireVersMiseAJour({ ...franchise, iban: ' fr76 3000 6000 0112 3456 7890 189 ', facturationRue: ' 3 rue C ', delaiPaiementJours: ' 45 ' });
    expect(m).toMatchObject({ iban: 'FR7630006000011234567890189', facturation_adresse_rue: '3 rue C', delai_paiement_jours: 45 });
  });
  it('aller-retour : relire ce qu\'on vient d\'écrire redonne le formulaire', () => {
    const f: FormulaireFacturation = {
      regimeTva: 'assujetti', tauxTva: '5.5', agrementSap: true, dateDeclarationSap: '2026-03-04', modeIntervention: 'prestataire',
      adresseIntervention: '2 rue B', facturationRue: '3 rue C', facturationCodePostal: '00001', facturationVille: 'Ailleurs',
      iban: 'FR7630006000011234567890189', delaiPaiementJours: '45', penalitesRetard: 'Pénalités légales',
    };
    expect(lireFormulaire(formulaireVersMiseAJour(f))).toEqual(f);
  });
});

describe('messages', () => {
  it('traduit les contraintes de la base', () => {
    expect(messageEnregistrementLisible('new row for relation "praticiens" violates check constraint "praticiens_taux_tva_coherent"')).toMatch(/agrément SAP/);
    expect(messageEnregistrementLisible('violates check constraint "praticiens_iban_format"')).toBe('IBAN invalide.');
    expect(messageEnregistrementLisible('autre')).toBe('autre');
  });
  it('alerte sur un SIRET mal formé, pas sur un SIRET absent ni correct', () => {
    expect(siretAAlerter({ ...identite, siret: '' })).toBeNull();
    expect(siretAAlerter({ ...identite, siret: '73282932000074' })).toBeNull();
    expect(siretAAlerter({ ...identite, siret: '1234' })).toBeTruthy();
  });
});
