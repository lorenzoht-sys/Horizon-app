import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { nettoyerUrl, nettoyerEvenement, nettoyerBreadcrumb } from './sentryNettoyage';

const UUID = '3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b';
const ORIGINE = 'https://app.exemple.test';

describe('nettoyerUrl', () => {
  it('retire ?code=, ?ptoken=, ?token= et le hash', () => {
    expect(nettoyerUrl(`/patient/${UUID}?code=ABC123`, ORIGINE)).toBe('/patient/:id');
    expect(nettoyerUrl(`/patient/${UUID}?ptoken=secret-jeton#x`, ORIGINE)).toBe('/patient/:id');
    expect(nettoyerUrl('https://app.exemple.test/api/planning/ics?token=jeton-agenda', ORIGINE)).toBe('/api/planning/ics');
  });

  it('masque les jetons dans le chemin du portail structure et de la vue client', () => {
    expect(nettoyerUrl('/structure/jeton-portail/patient/' + UUID, ORIGINE)).toBe('/structure/:token/patient/:id');
    expect(nettoyerUrl('/client/jeton-client', ORIGINE)).toBe('/client/:token');
  });

  it('ne touche pas /structures (liste côté praticien)', () => {
    expect(nettoyerUrl('/structures', ORIGINE)).toBe('/structures');
  });

  it('retire les filtres Supabase REST', () => {
    expect(nettoyerUrl('https://projet.supabase.co/rest/v1/participants?prenom=eq.E2E', ORIGINE)).toBe('/rest/v1/participants');
  });
});

describe('nettoyerEvenement', () => {
  it('supprime event.user, la query string et les cookies ; réduit l\'URL au chemin', () => {
    const e = nettoyerEvenement({
      type: undefined,
      user: { id: 'u1', email: 'e2e@exemple.invalid', ip_address: '1.2.3.4' },
      request: { url: `${ORIGINE}/patient/${UUID}?code=ABC123`, query_string: 'code=ABC123', cookies: { s: 'x' } },
    } as ErrorEvent, ORIGINE);
    expect(e.user).toBeUndefined();
    expect(e.request).toEqual({ url: '/patient/:id' });
  });
});

describe('nettoyerBreadcrumb', () => {
  it('supprime les breadcrumbs console', () => {
    expect(nettoyerBreadcrumb({ category: 'console', message: 'E2E Pseudotest' })).toBeNull();
  });

  it('navigation : nettoie data.from et data.to', () => {
    const b = nettoyerBreadcrumb({
      category: 'navigation',
      data: { from: `/patient/${UUID}?ptoken=secret`, to: '/structure/jeton?token=abc#h' },
    }, ORIGINE);
    expect(b?.data).toEqual({ from: '/patient/:id', to: '/structure/:token' });
  });

  it('fetch/xhr : nettoie data.url et conserve le reste', () => {
    const b = nettoyerBreadcrumb({ category: 'fetch', data: { url: '/api/patient/me?code=ABC', status_code: 401 } }, ORIGINE);
    expect(b?.data).toEqual({ url: '/api/patient/me', status_code: 401 });
  });

  it('ui.click : ne garde que le type d\'élément (ni title, ni aria-label, ni classes)', () => {
    const b = nettoyerBreadcrumb({
      category: 'ui.click',
      message: 'body > div#root > button.btn-danger[title="Supprimer E2E Pseudotest"][aria-label="Supprimer E2E"]',
      data: { 'ui.component_name': 'Fiche' },
    });
    expect(b?.message).toBe('button');
    expect(b?.data).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain('E2E');
  });

  it('ui.input : même traitement', () => {
    expect(nettoyerBreadcrumb({ category: 'ui.input', message: 'input#nom[name="nom"]' })?.message).toBe('input');
  });
});
