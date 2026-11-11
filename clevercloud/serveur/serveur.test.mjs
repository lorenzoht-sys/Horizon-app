// Tests du serveur Clever Cloud : `node --test clevercloud/` (aucune
// dépendance npm). Routes et front factices, créés dans un dossier temporaire.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerServeur, chargerEnTetes, verifierEnvironnement, listerRoutes } from './serveur.mjs';
import { normaliserIp } from './compatVercel.mjs';
import { delaiAvantProchainPassage, cronInterneActif } from './cron.mjs';

let base, serveur;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-serveur-'));
  const api = path.join(tmp, 'api');
  fs.mkdirSync(path.join(api, 'patient'), { recursive: true });
  fs.mkdirSync(path.join(api, '_lib'), { recursive: true });
  fs.writeFileSync(path.join(api, 'patient', 'me.js'), `export default async (req, res) =>
    res.status(200).json({ methode: req.method, query: req.query, body: req.body, ip: req.headers['x-forwarded-for'] });`);
  fs.writeFileSync(path.join(api, 'planning.js'), `export default async (req, res) => {
    res.setHeader('Content-Type', 'text/calendar'); return res.status(200).send('BEGIN:VCALENDAR'); };`);
  fs.writeFileSync(path.join(api, 'boum.js'), `export default async () => { throw new Error('secret: Jeanne'); };`);
  fs.writeFileSync(path.join(api, '_me.test.js'), 'export default () => {};');
  fs.writeFileSync(path.join(api, '_lib', 'aide.js'), 'export default () => {};');
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>app');
  fs.writeFileSync(path.join(dist, 'assets', 'a-123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'ne doit pas sortir');

  serveur = creerServeur({ dossierApi: api, dossierStatique: dist });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => serveur.close());

test('une route api reçoit méthode, query et corps JSON', async () => {
  const r = await fetch(`${base}/api/patient/me?x=1`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 2 }),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual([j.methode, j.query, j.body], ['POST', { x: '1' }, { a: 2 }]);
});

test("seule la dernière IP de X-Forwarded-For (celle du load balancer) est transmise", async () => {
  const r = await fetch(`${base}/api/patient/me`, { headers: { 'X-Forwarded-For': '1.1.1.1, 203.0.113.9' } });
  assert.equal((await r.json()).ip, '203.0.113.9');
  const h = { 'x-forwarded-for': ['9.9.9.9', '5.5.5.5'] };
  normaliserIp(h);
  assert.equal(h['x-forwarded-for'], '5.5.5.5');
});

test('send() garde le type de contenu choisi par la route', async () => {
  const r = await fetch(`${base}/api/planning`);
  assert.equal(r.headers.get('content-type'), 'text/calendar');
  assert.equal(await r.text(), 'BEGIN:VCALENDAR');
});

test("les fichiers _lib et _*.test ne sont pas des routes", async () => {
  assert.equal((await fetch(`${base}/api/_me.test`)).status, 404);
  assert.equal((await fetch(`${base}/api/_lib/aide`)).status, 404);
  assert.equal((await fetch(`${base}/api/inconnue`)).status, 404);
});

test("une exception de route renvoie 500 sans aucun détail", async () => {
  const r = await fetch(`${base}/api/boum`);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'Erreur serveur' });
});

test('front : fichier statique, réécriture SPA et pas de sortie du dossier', async () => {
  const asset = await fetch(`${base}/assets/a-123.js`);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal(await (await fetch(`${base}/patient/accueil`)).text(), '<!doctype html>app');
  assert.equal(await (await fetch(`${base}/%2e%2e/secret.txt`)).text(), '<!doctype html>app');
});

test('les en-têtes de sécurité de vercel.json sont appliqués', async () => {
  const r = await fetch(`${base}/patient/accueil`);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(r.headers.get('content-security-policy'));
  const api = await fetch(`${base}/api/patient/me`);
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test("l'ICS n'est pas en no-store (règle de vercel.json)", () => {
  const regles = chargerEnTetes();
  const noStore = regles.find(r => r.entetes.some(e => e.value === 'no-store'));
  assert.ok(noStore.motif.test('/api/patient/me'));
  assert.ok(!noStore.motif.test('/api/planning/ics'));
});

test('APP_ENV est obligatoire et fixe VERCEL_ENV', () => {
  assert.throws(() => verifierEnvironnement({}));
  const env = { APP_ENV: 'production' };
  verifierEnvironnement(env);
  assert.equal(env.VERCEL_ENV, 'production');
  const st = { APP_ENV: 'staging' };
  verifierEnvironnement(st);
  assert.equal(st.VERCEL_ENV, 'preview');
});

test('cron interne : instance 0 seulement, à HH:15 UTC', () => {
  assert.equal(cronInterneActif({}), false);
  assert.equal(cronInterneActif({ CRON_INTERNE: '1' }), true);
  assert.equal(cronInterneActif({ CRON_INTERNE: '1', INSTANCE_NUMBER: '1' }), false);
  assert.equal(delaiAvantProchainPassage(new Date('2026-11-09T10:00:00Z')), 15 * 60_000);
  assert.equal(delaiAvantProchainPassage(new Date('2026-11-09T10:15:00Z')), 60 * 60_000);
});

test('les vraies routes du dépôt sont bien recensées (12)', () => {
  // Contrôle sur les sources .ts : même règle de nommage que dist-api/.
  const routes = [];
  const parcourir = rel => {
    for (const nom of fs.readdirSync(path.join('api', rel))) {
      if (nom.startsWith('_') || nom === 'tsconfig.json') continue;
      const p = rel ? `${rel}/${nom}` : nom;
      if (fs.statSync(path.join('api', p)).isDirectory()) parcourir(p);
      else if (nom.endsWith('.ts')) routes.push(p);
    }
  };
  parcourir('');
  assert.equal(routes.length, 12);
  assert.equal(listerRoutes('/inexistant').size, 0);
});
