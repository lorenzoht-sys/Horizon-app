import { describe, expect, it } from 'vitest';
import { effacerEtatSession, effacerTousEtatsSession, ecrireEtatSession, lireEtatSession, type StockageSession } from './etatSession';

function stockageMemoire(initial: Record<string, string> = {}): StockageSession & { donnees: Map<string, string> } {
  const donnees = new Map(Object.entries(initial));
  return {
    donnees,
    get length() { return donnees.size; },
    key: (i: number) => [...donnees.keys()][i] ?? null,
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => { donnees.set(k, v); },
    removeItem: (k: string) => { donnees.delete(k); },
  };
}

describe('etatSession', () => {
  it('relit ce qui a été écrit (aller-retour JSON)', () => {
    const s = stockageMemoire();
    ecrireEtatSession('form', { prenom: 'Marie', cases: [true, false] }, s);
    expect(lireEtatSession('form', s)).toEqual({ prenom: 'Marie', cases: [true, false] });
  });

  it('renvoie null pour une clé absente ou un contenu illisible', () => {
    const s = stockageMemoire({ horizon_etat_casse: '{pas du json' });
    expect(lireEtatSession('absente', s)).toBeNull();
    expect(lireEtatSession('casse', s)).toBeNull();
  });

  it('écrire null ou undefined efface la clé', () => {
    const s = stockageMemoire();
    ecrireEtatSession('x', 'valeur', s);
    ecrireEtatSession('x', null, s);
    expect(s.donnees.size).toBe(0);
  });

  it('effacerEtatSession ne touche que sa clé', () => {
    const s = stockageMemoire();
    ecrireEtatSession('a', 1, s);
    ecrireEtatSession('b', 2, s);
    effacerEtatSession('a', s);
    expect(lireEtatSession('a', s)).toBeNull();
    expect(lireEtatSession('b', s)).toBe(2);
  });

  it('à la déconnexion, efface tout l’état de travail et rien d’autre', () => {
    const s = stockageMemoire({ pwa_dismissed: '1' });
    ecrireEtatSession('assistant', ['q', 'r'], s);
    ecrireEtatSession('dictee_p1', { observations: 'santé' }, s);
    effacerTousEtatsSession(s);
    expect([...s.donnees.keys()]).toEqual(['pwa_dismissed']);
  });

  it('sans stockage disponible, ne plante pas', () => {
    expect(() => ecrireEtatSession('x', 1, null)).not.toThrow();
    expect(lireEtatSession('x', null)).toBeNull();
    expect(() => effacerTousEtatsSession(null)).not.toThrow();
  });

  it('un stockage qui refuse l’écriture (quota) ne plante pas', () => {
    const s = stockageMemoire();
    s.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => ecrireEtatSession('x', 'gros', s)).not.toThrow();
  });
});
