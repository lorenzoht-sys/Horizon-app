// Le temps de comparaison n'est pas testable de façon fiable (le bruit de la
// machine dépasse l'écart qu'on cherche à supprimer). Ce qui EST testable, et
// ce qui casse en pratique, c'est le comportement fonctionnel — en
// particulier sur des longueurs différentes, où l'implémentation naïve
// `timingSafeEqual(Buffer.from(a), Buffer.from(b))` lève une exception et
// transforme un 401 en 500.
import { describe, it, expect } from 'vitest';
import { secretsIdentiques } from './secrets.js';

describe('secretsIdentiques', () => {
  it('accepte deux secrets identiques', () => {
    expect(secretsIdentiques('s3cr3t-partage-long', 's3cr3t-partage-long')).toBe(true);
  });

  it('refuse deux secrets de même longueur qui diffèrent', () => {
    expect(secretsIdentiques('aaaaaaaaaa', 'aaaaaaaaab')).toBe(false);
  });

  it('refuse sans lever quand les longueurs diffèrent', () => {
    // Le cas qui justifie le hachage préalable : `timingSafeEqual` refuse deux
    // buffers de tailles différentes. Sans SHA-256, cette ligne planterait, et
    // la route répondrait 500 au lieu de 401 — ce qui indiquerait à
    // l'attaquant qu'il a trouvé la bonne longueur.
    expect(() => secretsIdentiques('court', 'un-secret-beaucoup-plus-long')).not.toThrow();
    expect(secretsIdentiques('court', 'un-secret-beaucoup-plus-long')).toBe(false);
  });

  it('refuse un secret fourni vide', () => {
    // Cas réel : en-tête absent, l'appelant passe `fourni ?? ''`.
    expect(secretsIdentiques('', 'le-vrai-secret')).toBe(false);
  });

  it('refuse un préfixe correct du secret attendu', () => {
    // L'attaque que la comparaison à temps constant vise à rendre inutile.
    expect(secretsIdentiques('le-vrai', 'le-vrai-secret')).toBe(false);
  });

  it('distingue deux secrets qui ne diffèrent que par le dernier caractère', () => {
    const attendu = 'K7pQz-9fLm2Rt4Vx8sNb1Wc3Ye6Ad0Gh';
    expect(secretsIdentiques(attendu.slice(0, -1) + 'i', attendu)).toBe(false);
  });

  it('compare correctement des caractères non ASCII', () => {
    // `update(x, 'utf8')` doit encoder de façon déterministe des deux côtés.
    expect(secretsIdentiques('clé-é@ü', 'clé-é@ü')).toBe(true);
    expect(secretsIdentiques('clé-é@ü', 'cle-e@u')).toBe(false);
  });
});
