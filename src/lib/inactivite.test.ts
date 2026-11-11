import { describe, it, expect } from 'vitest';
import {
  etatInactivite, lireDerniereActivite, noterActivite, oublierActivite,
  DELAI_INACTIVITE_MS, PREAVIS_INACTIVITE_MS, CLE_DERNIERE_ACTIVITE,
} from './inactivite';

function stockageMemoire(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const T0 = 1_800_000_000_000;

describe('etatInactivite', () => {
  it('reste actif avant le préavis', () => {
    expect(etatInactivite(T0, T0)).toBe('actif');
    expect(etatInactivite(T0, T0 + DELAI_INACTIVITE_MS - PREAVIS_INACTIVITE_MS - 1)).toBe('actif');
  });

  it('passe en préavis dans les dernières minutes', () => {
    expect(etatInactivite(T0, T0 + DELAI_INACTIVITE_MS - PREAVIS_INACTIVITE_MS)).toBe('preavis');
    expect(etatInactivite(T0, T0 + DELAI_INACTIVITE_MS - 1)).toBe('preavis');
  });

  it('expire au délai exact et au-delà', () => {
    expect(etatInactivite(T0, T0 + DELAI_INACTIVITE_MS)).toBe('expire');
    expect(etatInactivite(T0, T0 + 10 * DELAI_INACTIVITE_MS)).toBe('expire');
  });
});

describe('dernière activité', () => {
  it('une session sans trace démarre maintenant', () => {
    expect(lireDerniereActivite(stockageMemoire(), T0)).toBe(T0);
  });

  it('relit la valeur notée, puis l’oublie', () => {
    const s = stockageMemoire();
    noterActivite(s, T0);
    expect(lireDerniereActivite(s, T0 + 5000)).toBe(T0);
    oublierActivite(s);
    expect(lireDerniereActivite(s, T0 + 5000)).toBe(T0 + 5000);
  });

  it('ignore une valeur illisible ou dans le futur', () => {
    expect(lireDerniereActivite(stockageMemoire({ [CLE_DERNIERE_ACTIVITE]: 'abc' }), T0)).toBe(T0);
    expect(lireDerniereActivite(stockageMemoire({ [CLE_DERNIERE_ACTIVITE]: String(T0 + 99_999) }), T0)).toBe(T0);
  });

  it('une session restaurée après le délai est expirée', () => {
    const s = stockageMemoire({ [CLE_DERNIERE_ACTIVITE]: String(T0) });
    const maintenant = T0 + DELAI_INACTIVITE_MS + 1;
    expect(etatInactivite(lireDerniereActivite(s, maintenant), maintenant)).toBe('expire');
  });
});
