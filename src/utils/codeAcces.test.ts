import { describe, it, expect, vi, afterEach } from 'vitest';
import { genererCodeAcces } from './codeAcces';

// Caractères délibérément absents de l'alphabet : ils se confondent à
// l'oral ou à l'écrit quand on dicte un code au téléphone.
// 0/O et 1/I/L. Cette exclusion est une contrainte d'usage, pas un détail
// d'implémentation : un correctif de sécurité ne doit pas la faire sauter.
const CARACTERES_AMBIGUS = ['0', 'O', '1', 'I', 'L'];
const ALPHABET_ATTENDU = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('genererCodeAcces — forme du code (dictable au téléphone)', () => {
  it('verifierAlphabetDictable : aucun code ne contient 0, O, 1, I ni L', () => {
    const codes = Array.from({ length: 500 }, () => genererCodeAcces());
    const fautifs = codes.filter(code =>
      CARACTERES_AMBIGUS.some(c => code.includes(c)),
    );
    expect(fautifs).toEqual([]);
  });

  it("n'utilise que les 31 caractères de l'alphabet de référence", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const c of genererCodeAcces()) vus.add(c);
    }
    for (const c of vus) {
      expect(ALPHABET_ATTENDU).toContain(c);
    }
  });

  it('fait toujours exactement 8 caractères', () => {
    for (let i = 0; i < 200; i++) {
      expect(genererCodeAcces()).toHaveLength(8);
    }
  });

  // Garde anti-régression sur l'alphabet lui-même : si quelqu'un le
  // remplace un jour, les 31 caractères doivent tous rester atteignables,
  // sinon l'entropie annoncée (31^8) est fausse.
  it('les 31 caractères sont tous atteignables', () => {
    const vus = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      for (const c of genererCodeAcces()) vus.add(c);
    }
    expect(vus.size).toBe(ALPHABET_ATTENDU.length);
  });
});

describe('[F-02] genererCodeAcces — source aléatoire', () => {
  it("n'appelle jamais Math.random()", () => {
    const espion = vi.spyOn(Math, 'random');
    for (let i = 0; i < 50; i++) genererCodeAcces();
    expect(espion).not.toHaveBeenCalled();
  });

  it('tire depuis crypto.getRandomValues', () => {
    const espion = vi.spyOn(crypto, 'getRandomValues');
    genererCodeAcces();
    expect(espion).toHaveBeenCalled();
  });

  // Le test qui distingue un tirage par REJET d'un simple modulo.
  // 248 = 8 × 31 : c'est le premier octet à rejeter. Si on le repliait
  // (`248 % 31 === 0`), il produirait un '2' — le premier caractère de
  // l'alphabet, précisément le biais qu'on veut éviter.
  it('rejette les octets ≥ 248 au lieu de les replier (pas de biais modulo)', () => {
    let appel = 0;
    vi.stubGlobal('crypto', {
      ...crypto,
      getRandomValues: (tampon: Uint8Array) => {
        appel++;
        // 1er remplissage : que des octets à rejeter (248..255).
        if (appel === 1) tampon.fill(248);
        // 2e remplissage : les octets 0..7 → les 8 premiers caractères.
        else tampon.forEach((_, i) => { tampon[i] = i; });
        return tampon;
      },
    });

    // Si les octets 248 étaient repliés, le code commencerait par des '2'.
    expect(genererCodeAcces()).toBe('23456789');
    expect(appel).toBe(2);
  });

  it('ne produit pas de doublon sur 2000 tirages', () => {
    const codes = new Set(
      Array.from({ length: 2000 }, () => genererCodeAcces()),
    );
    expect(codes.size).toBe(2000);
  });
});
