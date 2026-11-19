import { describe, it, expect } from 'vitest';
import {
  AGE_MAX_COMPTE_JOURS,
  NOMBRE_ETAPES,
  calculerEtapes,
  destinationEtape,
  doitAfficherGuide,
  fusionnerEtats,
  lireEtatDemarrage,
  messageProgression,
  progression,
  type EntreesDemarrage,
} from './demarrage';

const VIDE: EntreesDemarrage = {
  compteurs: { beneficiaires: 0, bilans: 0, seances: 0, programmes: 0 },
  profilFacturationComplet: false,
  applicationInstallee: false,
};

const COMPLET: EntreesDemarrage = {
  compteurs: { beneficiaires: 3, bilans: 2, seances: 5, programmes: 1 },
  profilFacturationComplet: true,
  applicationInstallee: true,
};

describe('calculerEtapes', () => {
  it('nouveau compte : seule la création du compte est faite', () => {
    const etapes = calculerEtapes(VIDE);
    expect(etapes).toHaveLength(NOMBRE_ETAPES);
    expect(etapes.filter(e => e.faite).map(e => e.id)).toEqual(['compte']);
  });

  it('bilan et programme sont bloqués tant qu’il n’y a aucun bénéficiaire', () => {
    const etapes = calculerEtapes(VIDE);
    const bloquees = etapes.filter(e => e.bloqueePar).map(e => e.id);
    expect(bloquees).toEqual(['bilan', 'programme']);
  });

  it('un bénéficiaire débloque bilan et programme', () => {
    const etapes = calculerEtapes({ ...VIDE, compteurs: { ...VIDE.compteurs, beneficiaires: 1 } });
    expect(etapes.some(e => e.bloqueePar)).toBe(false);
  });

  it('une étape faite n’est jamais bloquée', () => {
    // Cas réel : bénéficiaire supprimé après son bilan. Le bilan reste fait.
    const etapes = calculerEtapes({ ...VIDE, compteurs: { ...VIDE.compteurs, bilans: 1 } });
    const bilan = etapes.find(e => e.id === 'bilan')!;
    expect(bilan.faite).toBe(true);
    expect(bilan.bloqueePar).toBeNull();
  });

  it('chaque étape suit sa propre donnée', () => {
    const etapes = calculerEtapes(COMPLET);
    expect(etapes.every(e => e.faite)).toBe(true);
  });
});

describe('progression', () => {
  it('compte 1/7 et propose d’ajouter un bénéficiaire sur un compte neuf', () => {
    const p = progression(calculerEtapes(VIDE));
    expect(p).toMatchObject({ faites: 1, total: 7, pourcentage: 14, termine: false });
    expect(p.prochaine?.id).toBe('beneficiaire');
  });

  it('saute les étapes bloquées pour proposer une étape faisable', () => {
    // Bénéficiaire supprimé : bilan et programme bloqués, séance faisable.
    const entrees: EntreesDemarrage = {
      ...VIDE,
      compteurs: { beneficiaires: 0, bilans: 0, seances: 0, programmes: 0 },
    };
    const etapes = calculerEtapes(entrees).map(e => (e.id === 'beneficiaire' ? { ...e, faite: true } : e));
    expect(progression(etapes).prochaine?.id).toBe('seance');
  });

  it('terminé quand tout est fait', () => {
    const p = progression(calculerEtapes(COMPLET));
    expect(p).toMatchObject({ faites: 7, pourcentage: 100, termine: true, prochaine: null });
  });
});

describe('doitAfficherGuide', () => {
  const maintenant = new Date('2026-11-19T12:00:00Z');
  const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * 86_400_000).toISOString();

  it('affiché pour un compte récent', () => {
    expect(doitAfficherGuide({ etat: {}, compteCreeLe: ilYa(2), maintenant })).toBe(true);
  });

  it('pas imposé aux comptes installés avant sa mise en ligne', () => {
    expect(doitAfficherGuide({ etat: {}, compteCreeLe: ilYa(AGE_MAX_COMPTE_JOURS + 1), maintenant })).toBe(false);
  });

  it('rouvert depuis Paramètres : affiché même sur un compte ancien', () => {
    expect(doitAfficherGuide({ etat: { reaffiche: true }, compteCreeLe: ilYa(400), maintenant })).toBe(true);
  });

  it('masqué l’emporte sur tout', () => {
    expect(doitAfficherGuide({ etat: { masque: true, reaffiche: true }, compteCreeLe: ilYa(1), maintenant })).toBe(false);
  });

  it('date de création absente ou illisible : affiché plutôt que perdu', () => {
    expect(doitAfficherGuide({ etat: {}, compteCreeLe: null, maintenant })).toBe(true);
    expect(doitAfficherGuide({ etat: {}, compteCreeLe: 'pas une date', maintenant })).toBe(true);
  });
});

describe('destinationEtape', () => {
  const bureau = { mobile: false, dernierBeneficiaireId: 'b-1' };
  const mobile = { mobile: true, dernierBeneficiaireId: 'b-1' };

  it('bureau : chaque étape mène à une page du bureau', () => {
    expect(destinationEtape('beneficiaire', bureau)).toEqual({ type: 'route', url: '/participants/nouveau' });
    expect(destinationEtape('bilan', bureau)).toEqual({ type: 'route', url: '/participant/b-1/bilan/new' });
    expect(destinationEtape('seance', bureau)).toEqual({ type: 'route', url: '/agenda-v2' });
    expect(destinationEtape('programme', bureau)).toEqual({ type: 'route', url: '/participant/b-1/programme' });
    expect(destinationEtape('facturation', bureau)).toEqual({ type: 'route', url: '/settings/facturation' });
    expect(destinationEtape('application', bureau)).toEqual({ type: 'installation' });
  });

  it('mobile : jamais une page réservée au paysage', () => {
    expect(destinationEtape('seance', mobile)).toEqual({ type: 'route', url: '/agenda' });
    expect(destinationEtape('bilan', mobile)).toEqual({ type: 'route', url: '/?onglet=saisie&mode=bilan' });
    expect(destinationEtape('programme', mobile)).toEqual({ type: 'route', url: '/participant/b-1' });
  });

  it('sans bénéficiaire, bilan et programme mènent à la création d’un bénéficiaire', () => {
    const sans = { mobile: false, dernierBeneficiaireId: null };
    expect(destinationEtape('bilan', sans)).toEqual({ type: 'route', url: '/participants/nouveau' });
    expect(destinationEtape('programme', sans)).toEqual({ type: 'route', url: '/participants/nouveau' });
  });

  it('encode l’identifiant', () => {
    expect(destinationEtape('bilan', { mobile: false, dernierBeneficiaireId: 'a/b' }))
      .toEqual({ type: 'route', url: '/participant/a%2Fb/bilan/new' });
  });
});

describe('lireEtatDemarrage', () => {
  it('ne garde que les booléens connus à true', () => {
    expect(lireEtatDemarrage({ masque: true, reaffiche: 'oui', applicationInstallee: 1, autre: true })).toEqual({ masque: true });
  });

  it('tout ce qui n’est pas un objet donne un état vide', () => {
    for (const brut of [null, undefined, 'x', 3, [], [true]]) expect(lireEtatDemarrage(brut)).toEqual({});
  });
});

describe('fusionnerEtats', () => {
  it('sans base (colonne absente), la copie locale fait foi', () => {
    expect(fusionnerEtats(null, { masque: true })).toEqual({ masque: true });
  });

  it('la base fait foi pour masque, l’installation vient de l’une ou l’autre', () => {
    expect(fusionnerEtats({}, { masque: true, applicationInstallee: true })).toEqual({ applicationInstallee: true });
    expect(fusionnerEtats({ applicationInstallee: true }, {})).toEqual({ applicationInstallee: true });
  });
});

describe('messageProgression', () => {
  const p = (faites: number) => ({ faites, total: 7, pourcentage: Math.round((faites / 7) * 100), prochaine: null, termine: faites === 7 });

  it('s’adapte à l’avancement', () => {
    expect(messageProgression(p(1), null)).toBe('Quelques minutes pour prendre Horizon en main.');
    expect(messageProgression(p(2), null)).toBe('Encore 5 étapes pour être opérationnel.');
    expect(messageProgression(p(4), null)).toBe('Plus que 3 étapes, vous y êtes presque.');
    expect(messageProgression(p(6), null)).toBe('Plus qu’une étape.');
    expect(messageProgression(p(7), 'Pierre')).toBe('Bravo Pierre, tout est prêt.');
    expect(messageProgression(p(7), null)).toBe('Bravo, tout est prêt.');
  });
});
