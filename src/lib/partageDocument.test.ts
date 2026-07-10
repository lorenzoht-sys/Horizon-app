import { describe, it, expect, vi } from 'vitest';
import { partagerDocument } from './partageDocument';

describe('partagerDocument', () => {
  it('insert réussi → succes: true avec le message de succès', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const resultat = await partagerDocument(insert, 'Document partagé ✅');
    expect(resultat).toEqual({ succes: true, message: 'Document partagé ✅' });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('insert en échec → succes: false avec le message d\'erreur, jamais le message de succès', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'relation does not exist', code: 'PGRST205' } });
    const resultat = await partagerDocument(insert, 'Document partagé ✅');
    expect(resultat.succes).toBe(false);
    expect(resultat.message).toBe('Erreur lors du partage');
    expect(resultat.message).not.toBe('Document partagé ✅');
  });

  it('message d\'erreur personnalisable', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'nope' } });
    const resultat = await partagerDocument(insert, 'ok', 'Échec du partage, réessayez');
    expect(resultat).toEqual({ succes: false, message: 'Échec du partage, réessayez' });
  });
});
