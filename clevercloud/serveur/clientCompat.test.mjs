// `node --test clevercloud/serveur/` : ce que la couche de compatibilité
// remplace, et surtout ce qu'elle laisse intact quand rien n'est configuré.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Faux module @supabase/supabase-js : un client dont on reconnaît chaque propriété.
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'client-compat-'));
const fauxReel = path.join(dossier, 'reel.mjs');
fs.writeFileSync(fauxReel, `export function createClient(url) {
  return { url, auth: { marque: 'auth-reel' }, storage: { marque: 'stockage-reel' }, from(table) { return { table, client: this.url }; } };
}`);

// Chaque import avec une requête différente donne une instance neuve du module,
// qui relit l'environnement.
async function charger(env, cas) {
  const avant = { ...process.env };
  for (const cle of ['AUTH_JWT_SECRET', 'AUTH_JWKS_URL', 'CELLAR_ADDON_HOST', 'CELLAR_ADDON_KEY_ID', 'CELLAR_ADDON_KEY_SECRET']) delete process.env[cle];
  Object.assign(process.env, env);
  try {
    return await import(`./clientCompat.mjs?reel=${encodeURIComponent(pathToFileURL(fauxReel).href)}&cas=${cas}`);
  } finally {
    process.env = avant;
  }
}

test('rien de configuré : le client réel est rendu tel quel', async () => {
  const { createClient } = await charger({}, 'nu');
  const client = createClient('http://x');
  assert.equal(client.auth.marque, 'auth-reel');
  assert.equal(client.storage.marque, 'stockage-reel');
});

test('AUTH_JWT_SECRET posé : auth.getUser vérifie localement, le reste du client est intact', async () => {
  const secret = 'secret-de-test-de-plus-de-32-caracteres!';
  const { createClient } = await charger({ AUTH_JWT_SECRET: secret }, 'jeton');
  const client = createClient('http://x');
  assert.equal(client.storage.marque, 'stockage-reel');
  assert.deepEqual(client.from('factures'), { table: 'factures', client: 'http://x' });

  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sub = '3f2b8a0e-5c1d-4e7a-9b6f-0a1b2c3d4e5f';
  const base = `${b64({ alg: 'HS256' })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + 60 })}`;
  const jeton = `${base}.${crypto.createHmac('sha256', secret).update(base).digest('base64url')}`;
  assert.equal((await client.auth.getUser(jeton)).data.user.id, sub);
  assert.equal((await client.auth.getUser('faux.jeton.ici')).data.user, null);
});
