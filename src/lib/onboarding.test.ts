import { describe, it, expect } from 'vitest';
import {
  REPONSES_VIDES,
  erreurEtape,
  ligneOnboarding,
  lirePratique,
  lireMontant,
  bilanOnboarding,
  reponsesDepuisFiche,
  type ReponsesOnboarding,
} from './onboarding';
import { fusionnerEtats, lireEtatDemarrage } from './demarrage';
import { profilFacturationManquant } from './facturesAValider';

// SIRET fictif à clé de Luhn valide.
const SIRET = '12345678900015';

const complet: ReponsesOnboarding = {
  ...REPONSES_VIDES,
  prenom: 'Marie', nom: 'Durand', titre: 'Enseignant APA',
  lieux: ['domicile'], publics: ['seniors'],
  telephone: '06 12 34 56 78',
  adresseRue: '3 rue des Lilas', adresseCodePostal: '69003', adresseVille: 'Lyon',
  statut: 'ei', siret: '123 456 789 00015', tva: 'franchise_293B',
  tarifHoraire: '50', fraisKm: '0,45',
};

describe('erreurEtape', () => {
  it('exige prénom, nom et métier', () => {
    expect(erreurEtape('vous', REPONSES_VIDES)).toMatch(/prénom et votre nom/);
    expect(erreurEtape('vous', { ...REPONSES_VIDES, prenom: 'M', nom: 'D' })).toMatch(/métier/);
    expect(erreurEtape('vous', complet)).toBeNull();
  });

  it('laisse passer des coordonnées vides, refuse un code postal faux', () => {
    expect(erreurEtape('coordonnees', REPONSES_VIDES)).toBeNull();
    expect(erreurEtape('coordonnees', { ...complet, adresseCodePostal: '6900' })).toMatch(/5 chiffres/);
    expect(erreurEtape('coordonnees', { ...complet, telephone: '06 12' })).toMatch(/incomplet/);
  });

  it('exige un statut, puis un SIRET valide sauf pour un salarié', () => {
    expect(erreurEtape('activite', REPONSES_VIDES)).toMatch(/comment vous exercez/);
    expect(erreurEtape('activite', { ...complet, siret: '' })).toMatch(/SIRET/);
    expect(erreurEtape('activite', { ...complet, siret: '12345678900016' })).not.toBeNull();
    expect(erreurEtape('activite', { ...complet, statut: 'salarie', siret: '' })).toBeNull();
    expect(erreurEtape('activite', complet)).toBeNull();
  });

  it('demande des frais kilométriques lisibles seulement à domicile', () => {
    expect(erreurEtape('activite', { ...complet, fraisKm: 'abc' })).toMatch(/kilométriques/);
    expect(erreurEtape('activite', { ...complet, lieux: ['cabinet'], fraisKm: 'abc' })).toBeNull();
  });
});

describe('lireMontant', () => {
  it('accepte la virgule et refuse le texte', () => {
    expect(lireMontant('0,50')).toBe(0.5);
    expect(lireMontant(' 45 ')).toBe(45);
    expect(lireMontant('45€')).toBeNull();
  });
});

describe('ligneOnboarding', () => {
  it('remplit le profil de facturation d’un entrepreneur individuel en franchise', () => {
    const l = ligneOnboarding(complet, { id: 'p1', email: 'm@x.fr', existant: null });
    expect(l).toMatchObject({
      siret: SIRET, forme_juridique: 'ei', regime_tva: 'franchise_293B', taux_tva: null,
      ville_signature: 'Lyon', tarif_horaire: '50', frais_km_defaut: '0.45',
    });
    // Même contrôle que la validation de facture : rien ne manque.
    expect(profilFacturationManquant({
      siret: l.siret as string, nom: l.nom as string, regimeTva: l.regime_tva as string,
      adresseRue: l.adresse_rue as string, adresseCodePostal: l.adresse_code_postal as string,
      adresseVille: l.adresse_ville as string, formeJuridique: l.forme_juridique as string,
      facturationAdresseRue: null, facturationCodePostal: null, facturationVille: null,
    } as Parameters<typeof profilFacturationManquant>[0])).toEqual([]);
  });

  it('n’écrit pas de régime de TVA quand le taux reste à choisir', () => {
    const l = ligneOnboarding({ ...complet, tva: 'a_voir' }, { id: 'p1', email: null, existant: null });
    expect(l).not.toHaveProperty('regime_tva');
    expect(l).not.toHaveProperty('taux_tva');
  });

  it('n’écrase pas la fiche d’un praticien invité par du vide', () => {
    const l = ligneOnboarding(
      { ...complet, telephone: '', adresseRue: '' },
      { id: 'p1', email: null, existant: { telephone: '0102030405', adresse_rue: '1 place X', ville_signature: 'Bron' } },
    );
    expect(l.telephone).toBe('0102030405');
    expect(l.adresse_rue).toBe('1 place X');
    expect(l.ville_signature).toBe('Bron');
  });

  it('salarié : ni forme juridique, ni TVA, ni SIRET effacé', () => {
    const l = ligneOnboarding({ ...complet, statut: 'salarie', siret: '' }, { id: 'p1', email: null, existant: { siret: SIRET } });
    expect(l.siret).toBe(SIRET);
    expect(l).not.toHaveProperty('forme_juridique');
    expect(l).not.toHaveProperty('regime_tva');
  });
});

describe('bilanOnboarding', () => {
  it('annonce un profil de facturation prêt, ou ce qui reste', () => {
    expect(bilanOnboarding(complet)).toEqual({ facturationPrete: true, reste: [] });
    expect(bilanOnboarding({ ...complet, adresseVille: '', tva: 'a_voir' }).reste).toEqual(['votre adresse professionnelle', 'votre taux de TVA']);
  });
});

describe('pratique dans praticiens.demarrage', () => {
  it('ne garde que les identifiants connus', () => {
    expect(lirePratique({ lieux: ['domicile', 'lune', 'domicile'], publics: ['cancer', 3] }))
      .toEqual({ lieux: ['domicile'], publics: ['cancer'] });
    expect(lirePratique({ lieux: [], publics: [] })).toBeUndefined();
    expect(lirePratique('x')).toBeUndefined();
  });

  it('survit à une écriture du guide (masquer ne l’efface pas)', () => {
    const base = lireEtatDemarrage({ masque: false, pratique: { lieux: ['cabinet'], publics: [] } });
    const suivant = lireEtatDemarrage({ ...fusionnerEtats(base, {}), masque: true });
    expect(suivant).toEqual({ masque: true, pratique: { lieux: ['cabinet'], publics: [] } });
  });
});

describe('reponsesDepuisFiche', () => {
  it('préremplit depuis une fiche existante', () => {
    const r = reponsesDepuisFiche({ prenom: 'Marie', forme_juridique: 'societe', regime_tva: 'assujetti', tarif_horaire: '55' });
    expect(r).toMatchObject({ prenom: 'Marie', statut: 'societe', tva: 'a_voir', tarifHoraire: '55' });
  });
});
