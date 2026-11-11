// Suite de la répétition à blanc (repetition.sh), côté HTTP : le chemin complet
// qu'empruntera le front praticien sur la cible.
//   navigateur → serveur Node (/rest/v1) → PostgREST → PostgreSQL standard + RLS
// Les jetons sont signés ici avec un secret de test (HS256) ; sur la cible, ils
// viendront du fournisseur d'identité. Jeu fictif de sql/02_controle_repetition.sql.
//
// Ignoré sans POSTGREST_URL : il faut un PostgREST branché sur la base de la
// répétition (job `repetition-cible` de la CI).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { creerServeur } from '../serveur/serveur.mjs';

const POSTGREST = process.env.POSTGREST_URL;
const SECRET = process.env.REPETITION_JWT_SECRET ?? '';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const options = { skip: !POSTGREST && 'POSTGREST_URL absent' };

const b64 = objet => Buffer.from(JSON.stringify(objet)).toString('base64url');
function jeton(sub, secret = SECRET) {
  const corps = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 300 })}`;
  return `${corps}.${crypto.createHmac('sha256', secret).update(corps).digest('base64url')}`;
}

let base, serveur;
before(async () => {
  if (!POSTGREST) return;
  serveur = creerServeur({ dossierApi: '/inexistant', dossierStatique: '/inexistant', dossierFonctions: '/inexistant', servirFront: false, regles: [], postgrest: POSTGREST, stockage: null });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${serveur.address().port}/rest/v1`;
});
after(() => serveur?.close());

const lire = (chemin, sub) => fetch(`${base}${chemin}`, { headers: sub ? { authorization: `Bearer ${jeton(sub)}` } : {} });

test('chaque praticien ne lit que son bénéficiaire', options, async () => {
  assert.deepEqual(await (await lire('/participants?select=prenom', A)).json(), [{ prenom: 'Alix' }]);
  assert.deepEqual(await (await lire('/participants?select=prenom', B)).json(), [{ prenom: 'Benoît' }]);
});

test('sans jeton, ou avec un jeton mal signé, rien n\'est lisible', options, async () => {
  const anonyme = await lire('/participants?select=prenom');
  assert.ok(anonyme.status === 401 || (anonyme.status === 200 && (await anonyme.json()).length === 0), `statut ${anonyme.status}`);
  const faux = await fetch(`${base}/participants?select=prenom`, { headers: { authorization: `Bearer ${jeton(A, 'un-autre-secret-de-plus-de-32-caracteres')}` } });
  assert.equal(faux.status, 401);
});

test('écriture : A crée chez lui, pas chez B, et ne modifie pas le bénéficiaire de B', options, async () => {
  const entetes = { authorization: `Bearer ${jeton(A)}`, 'content-type': 'application/json', prefer: 'return=representation' };
  const cree = await fetch(`${base}/participants`, { method: 'POST', headers: entetes, body: JSON.stringify({ nom: 'Fictif', prenom: 'Camille', rgpd: { consentementObtenu: true } }) });
  assert.equal(cree.status, 201);
  const [ligne] = await cree.json();
  assert.equal(ligne.praticien_id, A);

  const usurpe = await fetch(`${base}/participants`, { method: 'POST', headers: entetes, body: JSON.stringify({ nom: 'Fictif', prenom: 'Usurpé', rgpd: { consentementObtenu: true }, praticien_id: B }) });
  if (usurpe.status === 201) assert.equal((await usurpe.json())[0].praticien_id, A); // le trigger a réécrit l'identité
  else assert.ok([401, 403].includes(usurpe.status), `statut ${usurpe.status}`);
  assert.deepEqual(await (await lire('/participants?select=prenom&prenom=eq.Usurpé', B)).json(), []);

  const modif = await fetch(`${base}/participants?prenom=eq.Benoît`, { method: 'PATCH', headers: entetes, body: JSON.stringify({ nom: 'Modifié' }) });
  assert.deepEqual(await modif.json(), []);
  assert.deepEqual(await (await lire('/participants?select=nom&prenom=eq.Benoît', B)).json(), [{ nom: 'Fictif' }]);

  const sans = await fetch(`${base}/participants`, { method: 'POST', headers: entetes, body: JSON.stringify({ nom: 'Fictif', prenom: 'Sans-consentement' }) });
  assert.ok(sans.status >= 400, 'le garde-fou RGPD doit refuser');
});

test('une fonction SQL (RPC) répond à travers le relais', options, async () => {
  const rep = await fetch(`${base}/rpc/acces_participant`, {
    method: 'POST', headers: { authorization: `Bearer ${jeton(A)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_participant_id: '00000000-0000-4000-8000-000000000000' }),
  });
  assert.equal(rep.status, 200);
  assert.equal(await rep.json(), false); // bénéficiaire inexistant : pas d'accès
});
