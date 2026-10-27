import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import { cheminSeul, nettoyerEvenementServeur, nettoyerBreadcrumbServeur, withSentry } from './sentry.js';

describe('cheminSeul', () => {
  it('retire ?code=, ?ptoken=, ?token= et le hash', () => {
    expect(cheminSeul('/api/patient/session?code=ABC123')).toBe('/api/patient/session');
    expect(cheminSeul('/api/patient/me?ptoken=secret#x')).toBe('/api/patient/me');
    expect(cheminSeul('https://app.exemple.test/api/planning/ics?token=jeton-agenda')).toBe('/api/planning/ics');
  });

  it('valeur absente : « / »', () => {
    expect(cheminSeul(undefined)).toBe('/');
  });
});

describe('nettoyerEvenementServeur', () => {
  it('réduit request.url au chemin, retire query_string, corps, cookies et Authorization', () => {
    const e = nettoyerEvenementServeur({
      type: undefined,
      request: {
        url: 'https://app.exemple.test/api/structure/data?token=jeton-portail',
        query_string: 'token=jeton-portail',
        data: '{"prompt":"E2E Pseudotest"}',
        cookies: { s: 'x' },
        headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      },
    });
    expect(e.request).toEqual({ url: '/api/structure/data', headers: { 'content-type': 'application/json' } });
  });
});

describe('nettoyerBreadcrumbServeur', () => {
  it('appel sortant : chemin seul, sans http.query', () => {
    const b = nettoyerBreadcrumbServeur({
      category: 'http',
      data: { url: 'https://projet.supabase.co/rest/v1/participants?code_acces=eq.ABC', 'http.query': 'code_acces=eq.ABC', status_code: 200 },
    });
    expect(b?.data).toEqual({ url: '/rest/v1/participants', status_code: 200 });
  });

  it('supprime les breadcrumbs console', () => {
    expect(nettoyerBreadcrumbServeur({ category: 'console', message: 'x' })).toBeNull();
  });
});

describe('withSentry — tag route', () => {
  beforeEach(() => captureException.mockClear());

  it('ne contient que le chemin, sans la query string', async () => {
    const handler = withSentry(() => { throw new Error('boum'); });
    const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ url: '/api/planning/ics?token=jeton-agenda' }, res);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1]).toEqual({ tags: { route: '/api/planning/ics' } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
