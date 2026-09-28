import { describe, it, expect, afterEach, vi } from 'vitest';
import { getAppHost, getAppOrigin } from './config';

// Environnement de test = Node (vitest.config.ts) : `window` est undefined par défaut,
// simulé au cas par cas avec vi.stubGlobal pour reproduire un contexte navigateur
// (Preview / dev local) sans dépendre de jsdom.
function simulerNavigateur(host: string, protocole: 'http' | 'https' = 'https') {
  vi.stubGlobal('window', { location: { host, origin: `${protocole}://${host}` } });
}

describe('getAppHost / getAppOrigin — domaine canonique pour les artefacts longue durée', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('production réelle (VITE_VERCEL_ENV=production)', () => {
    it('ignore window.location — même si le navigateur est sur un ancien alias', () => {
      vi.stubEnv('VITE_VERCEL_ENV', 'production');
      vi.stubEnv('VITE_APP_URL', '');
      simulerNavigateur('horizon-app.vercel.app');
      expect(getAppHost()).toBe('app.horizon-suivi.fr');
      expect(getAppOrigin()).toBe('https://app.horizon-suivi.fr');
    });

    it('sans navigateur du tout (aucune régression du repli existant)', () => {
      vi.stubEnv('VITE_VERCEL_ENV', 'production');
      vi.stubEnv('VITE_APP_URL', '');
      expect(getAppHost()).toBe('app.horizon-suivi.fr');
    });
  });

  describe('hors production (Preview, dev local) — comportement inchangé', () => {
    it('Preview Vercel (VITE_VERCEL_ENV=preview) : suit window.location', () => {
      vi.stubEnv('VITE_VERCEL_ENV', 'preview');
      vi.stubEnv('VITE_APP_URL', '');
      simulerNavigateur('horizon-app-git-ma-branche-abc123-lorenzoht-sys-projects.vercel.app');
      expect(getAppHost()).toBe('horizon-app-git-ma-branche-abc123-lorenzoht-sys-projects.vercel.app');
      expect(getAppOrigin()).toBe('https://horizon-app-git-ma-branche-abc123-lorenzoht-sys-projects.vercel.app');
    });

    it('dev local (VITE_VERCEL_ENV absente) : suit window.location, protocole http gardé', () => {
      vi.stubEnv('VITE_VERCEL_ENV', '');
      vi.stubEnv('VITE_APP_URL', '');
      simulerNavigateur('localhost:5173', 'http');
      expect(getAppHost()).toBe('localhost:5173');
      expect(getAppOrigin()).toBe('http://localhost:5173');
    });

    it('sans navigateur (repli sur le domaine canonique, comme avant ce correctif)', () => {
      vi.stubEnv('VITE_VERCEL_ENV', '');
      vi.stubEnv('VITE_APP_URL', '');
      expect(getAppHost()).toBe('app.horizon-suivi.fr');
    });
  });

  describe('VITE_APP_URL — prime toujours, quel que soit l\'environnement', () => {
    it('en production : prime sur le domaine en dur', () => {
      vi.stubEnv('VITE_VERCEL_ENV', 'production');
      vi.stubEnv('VITE_APP_URL', 'https://autre-domaine.fr');
      expect(getAppHost()).toBe('autre-domaine.fr');
      expect(getAppOrigin()).toBe('https://autre-domaine.fr');
    });

    it('sur Preview : prime aussi sur window.location', () => {
      vi.stubEnv('VITE_VERCEL_ENV', 'preview');
      vi.stubEnv('VITE_APP_URL', 'https://autre-domaine.fr/');
      simulerNavigateur('un-preview.vercel.app');
      expect(getAppHost()).toBe('autre-domaine.fr');
    });

    it('vide ou blanche : ignorée, repli normal', () => {
      vi.stubEnv('VITE_VERCEL_ENV', 'production');
      vi.stubEnv('VITE_APP_URL', '   ');
      expect(getAppHost()).toBe('app.horizon-suivi.fr');
    });
  });
});
