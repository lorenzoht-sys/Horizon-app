import { describe, it, expect } from 'vitest';
import {
  AGE_MAX_COMPTE_JOURS,
  NOMBRE_ETAPES,
  calculerEtapes,
  destinationEtape,
  etapeDepuisNavigation,
  etapesNouvellementFaites,
  doitAfficherGuide,
  enPremiersPas,
  fusionnerEtats,
  guideEtape,
  lireEtatDemarrage,
  messageBravo,
  messageProgression,
  phraseManquesFacturation,
  progression,
  reperesEtape,
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
  const base = { etat: {}, termine: false, maintenant };

  it('affiché à tous les praticiens qui n’ont pas fini, même inscrits depuis longtemps', () => {
    expect(doitAfficherGuide({ ...base, compteCreeLe: ilYa(2) })).toBe(true);
    expect(doitAfficherGuide({ ...base, compteCreeLe: ilYa(400) })).toBe(true);
  });

  it('compte récent qui a tout fait : la carte de félicitations reste jusqu’à fermeture', () => {
    expect(doitAfficherGuide({ ...base, termine: true, compteCreeLe: ilYa(3) })).toBe(true);
  });

  it('compte ancien qui a déjà tout fait : pas de félicitations surgies de nulle part', () => {
    expect(doitAfficherGuide({ ...base, termine: true, compteCreeLe: ilYa(AGE_MAX_COMPTE_JOURS + 1) })).toBe(false);
  });

  it('rouvert depuis Paramètres : affiché même terminé sur un compte ancien', () => {
    expect(doitAfficherGuide({ ...base, termine: true, etat: { reaffiche: true }, compteCreeLe: ilYa(400) })).toBe(true);
  });

  it('masqué l’emporte sur tout', () => {
    expect(doitAfficherGuide({ ...base, etat: { masque: true, reaffiche: true }, compteCreeLe: ilYa(1) })).toBe(false);
  });

  it('date de création absente ou illisible : affiché plutôt que perdu', () => {
    expect(doitAfficherGuide({ ...base, termine: true, compteCreeLe: null })).toBe(true);
    expect(doitAfficherGuide({ ...base, termine: true, compteCreeLe: 'pas une date' })).toBe(true);
  });
});

describe('guideEtape', () => {
  const IDS = ['compte', 'beneficiaire', 'bilan', 'seance', 'programme', 'facturation', 'application'] as const;

  it('chaque étape explique pourquoi et comment, sur ordinateur comme sur téléphone', () => {
    for (const id of IDS) {
      for (const mobile of [false, true]) {
        const g = guideEtape(id, mobile);
        expect(g.pourquoi.length).toBeGreaterThan(20);
        expect(g.gestes.length).toBeGreaterThanOrEqual(1);
        expect(g.gestes.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('dit ce qui est obligatoire à la création d’une fiche (sinon le praticien reste bloqué)', () => {
    const bureau = guideEtape('beneficiaire', false).gestes.join(' ');
    expect(bureau).toContain('nombre de séances par semaine');
    expect(bureau).toContain('Le bénéficiaire a été informé et a consenti');
    expect(guideEtape('beneficiaire', true).gestes.join(' ')).toContain('consentement');
  });

  it('les gestes mobiles ne renvoient pas vers des écrans du bureau', () => {
    expect(guideEtape('programme', true).gestes[0]).toContain('fiche du bénéficiaire');
    expect(guideEtape('bilan', true).gestes[0]).toContain('Commencer le bilan');
  });
});

describe('phraseManquesFacturation', () => {
  it('rien ne manque : rien à dire', () => {
    expect(phraseManquesFacturation([])).toBeNull();
  });

  it('liste les manques et indique où saisir le SIRET', () => {
    expect(phraseManquesFacturation(['SIRET', 'adresse']))
      .toBe('Il manque encore : SIRET, adresse. Le SIRET et le nom se renseignent dans « Paramètres ».');
    expect(phraseManquesFacturation(['régime de TVA'])).toBe('Il manque encore : régime de TVA.');
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

describe('encart compagnon', () => {
  it('ne reprend qu’une étape connue dans l’état de navigation', () => {
    expect(etapeDepuisNavigation({ demarrage: 'bilan' })).toBe('bilan');
    expect(etapeDepuisNavigation({ demarrage: 'inconnue' })).toBeNull();
    expect(etapeDepuisNavigation({ programmeGenereIA: {} })).toBeNull();
    expect(etapeDepuisNavigation(null)).toBeNull();
    expect(etapeDepuisNavigation('bilan')).toBeNull();
  });

  it('donne le titre et le rang de l’étape', () => {
    expect(reperesEtape('bilan')).toEqual({ titre: 'Réaliser un premier bilan', numero: 3, total: 7 });
  });
});

describe('bravo', () => {
  it('premier passage : on ne félicite pas ce qui était fait avant le guide', () => {
    expect(etapesNouvellementFaites(null, ['compte', 'beneficiaire'])).toEqual([]);
  });

  it('félicite seulement ce qui vient d’être fait', () => {
    expect(etapesNouvellementFaites(['compte'], ['compte', 'bilan'])).toEqual(['bilan']);
    expect(etapesNouvellementFaites(['compte', 'bilan'], ['compte', 'bilan'])).toEqual([]);
  });

  it('message sobre, avec la suite', () => {
    const etapes = calculerEtapes({ ...VIDE, compteurs: { ...VIDE.compteurs, beneficiaires: 1, bilans: 1 } });
    expect(messageBravo(['bilan'], progression(etapes).prochaine)).toEqual({
      titre: 'Étape réussie : réaliser un premier bilan',
      description: 'Prochaine étape : planifier une séance.',
    });
    expect(messageBravo(['bilan', 'seance'], progression(etapes).prochaine)?.titre).toBe('2 étapes réussies');
    expect(messageBravo([], progression(etapes).prochaine)).toBeNull();
    expect(messageBravo(['application'], null)?.titre).toBe('Bravo, tout est prêt !');
  });
});

describe('enPremiersPas', () => {
  it('tant que le guide est visible, inachevé, et qu’aucun bilan n’est fait', () => {
    expect(enPremiersPas({ visible: true, termine: false, bilans: 0 })).toBe(true);
  });
  it('prend fin au premier bilan', () => {
    expect(enPremiersPas({ visible: true, termine: false, bilans: 1 })).toBe(false);
  });
  it('jamais si le guide est masqué ou terminé', () => {
    expect(enPremiersPas({ visible: false, termine: false, bilans: 0 })).toBe(false);
    expect(enPremiersPas({ visible: true, termine: true, bilans: 0 })).toBe(false);
  });
});
