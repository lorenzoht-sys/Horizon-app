import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkStructureRateLimit, STRUCTURE_RATE_LIMIT_MAX } from './structureAuth.js';

// Faux client : enregistre la requête de comptage et renvoie le compte voulu.
function fauxClient(count: number | null) {
  const vu: { table?: string; structureId?: unknown; depuis?: unknown; options?: unknown } = {};
  const client = {
    from(table: string) {
      vu.table = table;
      return {
        select(_colonnes: string, options: unknown) {
          vu.options = options;
          return {
            eq(_colonne: string, valeur: unknown) {
              vu.structureId = valeur;
              return {
                gte(_c: string, depuis: unknown) {
                  vu.depuis = depuis;
                  return Promise.resolve({ count });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, vu };
}

describe('checkStructureRateLimit', () => {
  it('laisse passer sous le plafond, refuse au plafond', async () => {
    expect(await checkStructureRateLimit(fauxClient(0).client, 's1')).toBe(true);
    expect(await checkStructureRateLimit(fauxClient(STRUCTURE_RATE_LIMIT_MAX - 1).client, 's1')).toBe(true);
    expect(await checkStructureRateLimit(fauxClient(STRUCTURE_RATE_LIMIT_MAX).client, 's1')).toBe(false);
  });

  it('compte les accès journalisés de CETTE structure sur la dernière minute, sans lire de ligne', async () => {
    const { client, vu } = fauxClient(3);
    const avant = Date.now();
    await checkStructureRateLimit(client, 'structure-42');
    expect(vu.table).toBe('structure_access_logs');
    expect(vu.structureId).toBe('structure-42');
    expect(vu.options).toEqual({ count: 'exact', head: true });
    const ecart = avant - new Date(String(vu.depuis)).getTime();
    expect(ecart).toBeGreaterThanOrEqual(59_000);
    expect(ecart).toBeLessThanOrEqual(61_000);
  });

  it('laisse passer si le comptage échoue : une panne du journal ne ferme pas le portail', async () => {
    expect(await checkStructureRateLimit(fauxClient(null).client, 's1')).toBe(true);
  });
});
