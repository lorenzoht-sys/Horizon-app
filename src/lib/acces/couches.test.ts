// Garde-fou d'architecture : aucune page ni aucun composant ne construit de
// requête Supabase. Les requêtes vivent dans src/hooks/, src/lib/acces/ ou
// les modules métier de src/lib/ (voir src/lib/acces/README.md).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../..', import.meta.url));
const REQUETE = /\.from\(\s*['"`]|\.rpc\(\s*['"`]/;

function fichiersFautifs(dossier: string): string[] {
  const fautifs: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of fs.readdirSync(d)) {
      const p = path.join(d, nom);
      if (fs.statSync(p).isDirectory()) { parcourir(p); continue; }
      if (!/\.(ts|tsx)$/.test(nom) || /\.test\./.test(nom)) continue;
      // Les commentaires peuvent citer une requête : on ne regarde que le code.
      const code = fs.readFileSync(p, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));
      if (code.some(l => REQUETE.test(l))) fautifs.push(path.relative(SRC, p));
    }
  };
  parcourir(path.join(SRC, dossier));
  return fautifs;
}

describe('couches', () => {
  it('aucune requête Supabase dans src/pages/', () => {
    expect(fichiersFautifs('pages')).toEqual([]);
  });

  it('aucune requête Supabase dans src/components/', () => {
    expect(fichiersFautifs('components')).toEqual([]);
  });
});
