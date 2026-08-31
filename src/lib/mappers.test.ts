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
import { describe, it, expect } from 'vitest';
import { normaliserVisibilite } from './mappers';

describe('normaliserVisibilite', () => {
  it('respecte un message masqué qui ne porte que l\'ancienne clé', () => {
    // LE cas qui compte. Une ligne non encore migrée, message masqué.
    const v = normaliserVisibilite({ progression: true, messagePierre: false });
    expect(v.messagePraticien).toBe(false);
    expect(v.messagePierre).toBe(false);
  });

  it('respecte un message masqué qui ne porte que la nouvelle clé', () => {
    const v = normaliserVisibilite({ progression: true, messagePraticien: false });
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
    const v = normaliserVisibilite({ progression: true });
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
    expect(v.progression).toBe(true);
    expect(v.rdv).toBe(true);
    expect(v.programme).toBe(true);
  });
});
