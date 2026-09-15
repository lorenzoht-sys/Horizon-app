import { describe, it, expect } from 'vitest';
import { dbToBilan, bilanToDb, normaliserVisibilite } from './mappers';
import { ALL_TESTS } from '../data/profiles';
import type { Bilan, TestKey } from '../types';

// ── Ce que ces tests protègent ────────────────────────────────────────────
//
// `bilanToDb` construit un objet à CHAMPS NOMMÉS. Un test absent de cette
// liste n'est pas une erreur : il n'existe simplement pas dans le résultat,
// l'enregistrement réussit sans lui, et la réouverture n'a rien à restaurer.
//
// C'est arrivé à l'Apley Scratch Test. Le test était complet partout —
// composant de saisie, type, normes, radar, delta, tableau comparatif — et
// figurait dans ALL_TESTS. Seules manquaient la colonne et les deux lignes du
// mapper. Saisi le 2026-07, signalé par Pierre le 2026-09-13, diagnostiqué le
// 2026-09-14 : deux mois de saisies perdues sans le moindre message d'erreur.
//
// Un test par mesure n'aurait pas suffi à l'attraper : il aurait fallu penser
// à en écrire un pour Apley, c'est-à-dire soupçonner l'oubli. Le contrôle
// ci-dessous compare un ENSEMBLE EXACT — les quatorze clés de ALL_TESTS contre
// ce qui survit réellement à l'aller-retour.

/**
 * Comment lire la valeur d'un test sur un Bilan.
 *
 * Typé `Record<TestKey, …>` : ajouter une clé à ALL_TESTS sans l'ajouter ici
 * ne compile pas. C'est la moitié structurelle du garde-fou — l'autre moitié
 * est l'assertion d'aller-retour.
 */
const VALEUR_DU_TEST: Record<TestKey, (b: Bilan) => unknown> = {
  equilibre: b => b.equilibre?.droite,
  chairStand: b => b.chairStand30,
  handGrip: b => b.handGrip?.droite,
  tug: b => b.tug3m,
  souplesse: b => b.souplesse?.valeur,
  tm6: b => b.tm6?.distanceMetres,
  memoire: b => b.memoire?.scoreImmediat,
  apley: b => b.apley?.score,
  tinetti: b => b.tinetti,
  eva: b => b.douleurEva,
  berg: b => b.berg,
  moca: b => b.mocaScore,
  marche10m: b => b.marche10m?.habituel,
  adl: b => b.adl,
};

/** Bilan dont les quatorze tests portent une valeur distinctive. */
function bilanComplet(): Bilan {
  return {
    id: 'b-1', date: '2026-09-14', type: 'initial', trimestre: 0,
    equilibre: { droite: 12.5, gauche: 11 },
    chairStand30: 14,
    handGrip: { droite: 28.5, gauche: 26 },
    tug3m: 9.4,
    souplesse: { methode: 'debout', valeur: -3 },
    tm6: { distanceMetres: 382 },
    memoire: { scoreImmediat: 7, scoreDiffere: 6 },
    apley: { haut_d: 'neck', haut_g: 'shoulder', bas_d: 'mid_back', bas_g: 'scapula', score: 3.5, notes: 'épaule droite raide' },
    tinetti: { equilibre: 14, marche: 10 },
    douleurEva: 3,
    berg: { item1: 4, item2: 3 },
    mocaScore: 27,
    marche10m: { habituel: 1.2, max: 1.8 },
    adl: { bain: true, habillage: true },
    iadl: { telephone: true },
  } as unknown as Bilan;
}

describe('Aller-retour Bilan ↔ base', () => {
  it('conserve les quatorze tests de ALL_TESTS', () => {
    const avant = bilanComplet();

    // `bilanToDb` produit les colonnes, `dbToBilan` les relit : leur contrat
    // commun est exactement ce qui est vérifié ici.
    const apres = dbToBilan(bilanToDb('p-1', avant) as Record<string, unknown>);

    for (const cle of ALL_TESTS) {
      expect(
        VALEUR_DU_TEST[cle](apres),
        `le test « ${cle} » ne survit pas à l'enregistrement : vérifier bilanToDb, dbToBilan et la colonne correspondante`,
      ).toEqual(VALEUR_DU_TEST[cle](avant));
    }
  });

  it('aucun test de ALL_TESTS n’est perdu en silence', () => {
    const avant = bilanComplet();
    const apres = dbToBilan(bilanToDb('p-1', avant) as Record<string, unknown>);

    // Formulé comme une comparaison d'ensembles plutôt qu'une boucle
    // d'assertions : l'échec nomme d'un coup TOUS les tests perdus, pas
    // seulement le premier rencontré.
    const perdus = ALL_TESTS.filter(cle => VALEUR_DU_TEST[cle](apres) === undefined);

    expect(perdus).toEqual([]);
  });
});

describe('Apley Scratch Test', () => {
  it('survit à un aller-retour complet, détail des quatre mesures compris', () => {
    const avant = bilanComplet();

    const apres = dbToBilan(bilanToDb('p-1', avant) as Record<string, unknown>);

    expect(apres.apley).toEqual({
      haut_d: 'neck', haut_g: 'shoulder', bas_d: 'mid_back', bas_g: 'scapula',
      score: 3.5, notes: 'épaule droite raide',
    });
  });

  it('passe bien par la colonne apley_data', () => {
    // L'oubli portait sur la colonne autant que sur le mapper : vérifier le
    // seul objet reconstruit laisserait passer un aller-retour qui transiterait
    // par un autre champ (le JSON bilan_initial_data, par exemple).
    const ligne = bilanToDb('p-1', bilanComplet());

    expect(ligne).toHaveProperty('apley_data');
    expect((ligne as { apley_data: { score: number } }).apley_data.score).toBe(3.5);
  });

  it('écrit null plutôt que d’omettre la clé quand le test n’est pas renseigné', () => {
    // Omettre la clé laisserait une valeur précédente en base lors d'une mise
    // à jour : un test effacé par le praticien doit s'effacer en base aussi.
    const sansApley = { ...bilanComplet(), apley: undefined };

    const ligne = bilanToDb('p-1', sansApley as Bilan);

    expect(ligne).toHaveProperty('apley_data');
    expect((ligne as { apley_data: unknown }).apley_data).toBeNull();
  });

  it('relit une absence comme une absence, jamais comme un zéro', () => {
    // Même règle que sur les questionnaires (src/lib/scoresAutonomie.ts) :
    // une donnée absente ne doit pas se présenter comme une valeur mesurée.
    const apres = dbToBilan({ id: 'b-1', date: '2026-09-14', type: 'initial' });

    expect(apres.apley).toBeUndefined();
    expect(apres.apley?.score).not.toBe(0);
  });
});

// Réconciliation de `messagePierre` (ancienne clé) et `messagePraticien`
// (nouvelle), pendant la transition ouverte par la migration
// 20260831_visibilite_message_praticien.
//
// Cette clé décide si le message laissé par le praticien est transmis au
// bénéficiaire. Se tromper ne produit aucune erreur : ça fait apparaître un
// message qu'un praticien avait masqué, ou disparaître un message qu'il
// affichait. Personne ne le verrait.
//
// Le piège précis que ces tests verrouillent : `{ ...DÉFAUT, ...ligne }`
// donne `messagePraticien: true` à une ligne qui ne porte que
// `messagePierre: false`, parce que la clé absente prend la valeur du défaut.
// C'est la régression que la contre-épreuve SQL a été vue produire.
//
// `progression` a été retiré de VisibiliteBeneficiaire (fusion du partage en
// un seul mécanisme, 2026-09-14) : les objets passés ici ne le portent plus,
// contrairement à la version d'origine de ces tests.
describe('normaliserVisibilite', () => {
  it('respecte un message masqué qui ne porte que l\'ancienne clé', () => {
    // LE cas qui compte. Une ligne non encore migrée, message masqué.
    const v = normaliserVisibilite({ messagePierre: false });
    expect(v.messagePraticien).toBe(false);
    expect(v.messagePierre).toBe(false);
  });

  it('respecte un message masqué qui ne porte que la nouvelle clé', () => {
    const v = normaliserVisibilite({ messagePraticien: false });
    expect(v.messagePraticien).toBe(false);
    expect(v.messagePierre).toBe(false);
  });

  it('maintient les deux clés à la même valeur', () => {
    // Une ligne réécrite par le nouveau code doit garder l'ancienne clé, sinon
    // tout code encore déployé la lirait comme absente, donc « visible ».
    for (const val of [true, false]) {
      const v = normaliserVisibilite({ messagePraticien: val });
      expect(v.messagePraticien, `pour ${val}`).toBe(val);
      expect(v.messagePierre, `pour ${val}`).toBe(val);
    }
  });

  it('fait primer la nouvelle clé quand les deux divergent', () => {
    // Ne devrait pas arriver — la migration les aligne — mais si ça arrive,
    // c'est la clé que le code écrit désormais qui fait foi.
    const v = normaliserVisibilite({ messagePraticien: false, messagePierre: true });
    expect(v.messagePraticien).toBe(false);
    expect(v.messagePierre).toBe(false);
  });

  it('affiche le message quand aucune des deux clés n\'est présente', () => {
    // Comportement actuel préservé : le défaut est « visible ». Le changer
    // masquerait des messages aujourd'hui affichés.
    const v = normaliserVisibilite({});
    expect(v.messagePraticien).toBe(true);
    expect(v.messagePierre).toBe(true);
  });

  it('tolère null et undefined', () => {
    for (const brut of [null, undefined]) {
      expect(normaliserVisibilite(brut).messagePraticien, String(brut)).toBe(true);
    }
  });

  it('ne touche pas aux autres réglages de visibilité', () => {
    const v = normaliserVisibilite({ bilans: false, carteSante: false, messagePierre: true });
    expect(v.bilans).toBe(false);
    expect(v.carteSante).toBe(false);
    // Ceux que la ligne ne porte pas gardent le défaut.
    expect(v.rdv).toBe(true);
    expect(v.programme).toBe(true);
  });
});
