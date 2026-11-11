// `node --test clevercloud/` : relais /rest/v1 et lecture des factures, contre
// un faux PostgREST qui applique une « RLS » élémentaire sur le jeton.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { creerServeur } from './serveur.mjs';

let base, serveur, fauxPostgrest;
const vus = [];

before(async () => {
  fauxPostgrest = http.createServer(async (req, res) => {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    vus.push({ methode: req.method, url: req.url, auth: req.headers.authorization, prefer: req.headers.prefer, corps: Buffer.concat(morceaux).toString() });
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization === 'Bearer expire') { res.statusCode = 401; return res.end('{}'); }
    if (req.url.startsWith('/factures?')) {
      // Seul le praticien A « voit » la facture p1/F-1.pdf.
      const visible = req.headers.authorization === 'Bearer praticien-a' && req.url.includes('pdf_path=eq.p1%2FF-1.pdf');
      return res.end(JSON.stringify(visible ? [{ id: 'f1' }] : []));
    }
    res.statusCode = 201;
    res.setHeader('content-range', '0-0/*');
    res.end(JSON.stringify({ recu: req.url }));
  });
  await new Promise(r => fauxPostgrest.listen(0, '127.0.0.1', r));
  const fichiers = new Map([['p1/F-1.pdf', '%PDF fictif'], ['p2/F-2.pdf', '%PDF autre']]);
  const stockage = { from: () => ({ download: async c => (fichiers.has(c) ? { data: new Blob([fichiers.get(c)]), error: null } : { data: null, error: { message: 'Object not found' } }) }) };
  serveur = creerServeur({
    dossierApi: '/inexistant', dossierStatique: '/inexistant', dossierFonctions: '/inexistant', servirFront: false, regles: [],
    postgrest: `http://127.0.0.1:${fauxPostgrest.address().port}`, stockage,
  });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => { serveur?.close(); fauxPostgrest?.close(); });

test('/rest/v1 : préfixe retiré, méthode, requête, corps et en-têtes transmis', async () => {
  const rep = await fetch(`${base}/rest/v1/participants?select=id&nom=eq.Test`, {
    method: 'POST', headers: { authorization: 'Bearer praticien-a', prefer: 'return=representation', 'content-type': 'application/json' }, body: '{"nom":"Test"}',
  });
  assert.equal(rep.status, 201);
  assert.equal(rep.headers.get('content-range'), '0-0/*');
  assert.deepEqual(await rep.json(), { recu: '/participants?select=id&nom=eq.Test' });
  const v = vus.at(-1);
  assert.deepEqual([v.methode, v.auth, v.prefer, v.corps], ['POST', 'Bearer praticien-a', 'return=representation', '{"nom":"Test"}']);
});

test('/rest/v1/rpc : les appels de fonctions SQL passent aussi', async () => {
  await fetch(`${base}/rest/v1/rpc/valider_facture`, { method: 'POST', body: '{}' });
  assert.equal(vus.at(-1).url, '/rpc/valider_facture');
});

test('facture : servie au praticien qui la voit par la RLS', async () => {
  const rep = await fetch(`${base}/storage/v1/object/factures/p1/F-1.pdf`, { headers: { authorization: 'Bearer praticien-a' } });
  assert.equal(rep.status, 200);
  assert.equal(rep.headers.get('content-type'), 'application/pdf');
  assert.equal(rep.headers.get('cache-control'), 'no-store');
  assert.equal(await rep.text(), '%PDF fictif');
});

test('facture : 404 identique pour un autre praticien, un fichier absent ou hors bucket', async () => {
  const lire = (chemin, jeton) => fetch(`${base}/storage/v1/object/factures/${chemin}`, { headers: jeton ? { authorization: `Bearer ${jeton}` } : {} });
  assert.equal((await lire('p1/F-1.pdf', 'praticien-b')).status, 404);
  assert.equal((await lire('p2/F-2.pdf', 'praticien-a')).status, 404); // existe, mais aucune facture visible ne le référence
  assert.equal((await lire('absent.pdf', 'praticien-a')).status, 404);
  assert.equal((await lire('p1/F-1.pdf')).status, 401);
  assert.equal((await lire('p1/F-1.pdf', 'expire')).status, 401);
  assert.equal((await lire('p1/..%2F..%2Fsecret', 'praticien-a')).status, 400);
  assert.equal((await fetch(`${base}/storage/v1/object/factures/p1/F-1.pdf`, { method: 'DELETE', headers: { authorization: 'Bearer praticien-a' } })).status, 405);
});
