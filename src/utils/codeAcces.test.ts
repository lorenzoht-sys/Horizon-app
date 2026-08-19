import { describe, expect, it } from 'vitest';
import { genererCodeAcces } from './codeAcces';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

describe('genererCodeAcces (F-02, docs/RAPPORT_SECURITE.md)', () => {
  it('génère un code de 8 caractères, tous dans l\'alphabet sans caractères ambigus', () => {
    const code = genererCodeAcces();
    expect(code).toHaveLength(8);
    for (const c of code) expect(ALPHABET).toContain(c);
  });

  it('ne génère jamais deux fois le même code sur un grand échantillon (pas de constante cachée)', () => {
    const codes = new Set(Array.from({ length: 500 }, () => genererCodeAcces()));
    expect(codes.size).toBe(500);
  });
});
