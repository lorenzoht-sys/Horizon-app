import { describe, it, expect, afterEach, vi } from 'vitest';

// Environnement de test = Node (vitest.config.ts), donc `window` est toujours
// undefined ici : domaineConfigure()/getAppOrigin() ne peuvent jamais emprunter
// la branche "dev local sur window.location" pendant ces tests. C'est le
// comportement recherché pour Preview/Production, et exactement ce que ces tests
// vérifient — le cas "dev local" n'est testable qu'à la main (`npm run dev`).
import { getAppHost, getAppOrigin } from './config';

describe('getAppHost / getAppOrigin — domaine canonique pour les artefacts longue durée', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sans VITE_APP_URL (Preview/Production) : domaine canonique en dur, jamais window.location', () => {
    vi.stubEnv('VITE_APP_URL', '');
    expect(getAppHost()).toBe('app.horizon-suivi.fr');
    expect(getAppOrigin()).toBe('https://app.horizon-suivi.fr');
  });

  it('VITE_APP_URL configurée : prime sur le domaine en dur', () => {
    vi.stubEnv('VITE_APP_URL', 'https://autre-domaine.fr');
    expect(getAppHost()).toBe('autre-domaine.fr');
    expect(getAppOrigin()).toBe('https://autre-domaine.fr');
  });

  it('VITE_APP_URL avec un slash final : retiré', () => {
    vi.stubEnv('VITE_APP_URL', 'https://autre-domaine.fr/');
    expect(getAppHost()).toBe('autre-domaine.fr');
    expect(getAppOrigin()).toBe('https://autre-domaine.fr');
  });

  it('VITE_APP_URL vide ou blanche : ignorée, repli sur le domaine en dur', () => {
    vi.stubEnv('VITE_APP_URL', '   ');
    expect(getAppHost()).toBe('app.horizon-suivi.fr');
  });
});
