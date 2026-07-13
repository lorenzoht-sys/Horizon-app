// Garde-fou technique (voir BoutonReformulation.tsx) : un échec de l'appel IA
// doit lever une erreur claire, jamais renvoyer un texte vide ou tronqué
// silencieusement — c'est ce qui permet à l'appelant de laisser le champ
// inchangé plutôt que d'appliquer une "suggestion" cassée.
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  getAuthHeader: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
}));

import { suggererReformulation } from './reformulerMessageBeneficiaire';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('suggererReformulation', () => {
  it('retourne le texte reformulé nettoyé (trim) en cas de succès', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '  Un texte reformulé motivant.  ' }),
    }));

    const resultat = await suggererReformulation('Résultat faible.');
    expect(resultat).toBe('Un texte reformulé motivant.');
  });

  it('envoie le texte original dans le prompt, sans le modifier avant l\'appel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Reformulé.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await suggererReformulation('Force très faible ce trimestre.');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.prompt).toContain('Force très faible ce trimestre.');
    expect(body.model).toBe('claude-haiku-4-5-20251001');
  });

  it('lève une erreur claire si la requête HTTP échoue (le texte original reste inchangé côté appelant)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom',
    }));

    await expect(suggererReformulation('Texte quelconque')).rejects.toThrow(/Erreur API Claude/);
  });

  it('lève une erreur si la réponse est vide plutôt que de retourner une chaîne vide', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '   ' }),
    }));

    await expect(suggererReformulation('Texte quelconque')).rejects.toThrow(/vide/i);
  });

  it('lève une erreur si le fetch lui-même rejette (panne réseau)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    await expect(suggererReformulation('Texte quelconque')).rejects.toThrow('Network down');
  });
});
