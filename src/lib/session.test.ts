// Garde-fou de la migration HDS : l'identité du praticien se lit à UN seul
// endroit (src/lib/session.ts). Si un nouvel appel direct à
// supabase.auth.getUser() apparaît ailleurs dans le front, ce test échoue.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const getUser = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { getUser: () => getUser() } } }));

import { utilisateurCourant } from './session';

describe('utilisateurCourant', () => {
  beforeEach(() => getUser.mockReset());

  it('renvoie le praticien connecté', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    expect((await utilisateurCourant())?.id).toBe('u-1');
  });

  it('renvoie null sans session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await utilisateurCourant()).toBeNull();
  });
});

describe('point d’entrée unique', () => {
  it('aucun appel direct à auth.getUser() hors de session.ts', () => {
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of fs.readdirSync(dossier)) {
        const p = path.join(dossier, nom);
        if (fs.statSync(p).isDirectory()) parcourir(p);
        else if (/\.(ts|tsx)$/.test(nom) && !/\.test\./.test(nom) && !p.endsWith(path.join('lib', 'session.ts'))) {
          if (/auth\s*\.getUser\(/.test(fs.readFileSync(p, 'utf8'))) fautifs.push(p);
        }
      }
    };
    parcourir(fileURLToPath(new URL('..', import.meta.url)));
    expect(fautifs).toEqual([]);
  });
});
