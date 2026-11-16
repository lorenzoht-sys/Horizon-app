// Répétition « mode Keycloak » (2026-11-16, migration HDS). Question posée :
// quand PostgREST ne connaît les praticiens que par la clé PUBLIQUE du
// fournisseur d'identité (jetons RS256), comment le serveur signe-t-il son
// propre jeton service_role, que lisent les routes api/ et les Edge Functions ?
// Il n'a pas la clé privée du fournisseur.
//
// Réponse vérifiée ici, contre le vrai PostgREST : PGRST_JWT_SECRET reçoit un
// jeu de DEUX clés, la clé publique du fournisseur et une clé symétrique propre
// au serveur. Les jetons des praticiens (RS256) et le jeton service_role (HS256)
// sont alors acceptés tous les deux, et rien d'autre.
//
// Ignoré sans POSTGREST_JWKS_URL et CLES_REPETITION (job `repetition-cible`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { creerVerificateurJeton } from '../serveur/jetonPraticien.mjs';

const BASE = process.env.POSTGREST_JWKS_URL;
const DOSSIER = process.env.CLES_REPETITION;
const options = { skip: !(BASE && DOSSIER) && 'POSTGREST_JWKS_URL ou CLES_REPETITION absent' };
const cles = BASE && DOSSIER ? JSON.parse(fs.readFileSync(path.join(DOSSIER, 'cles.json'), 'utf8')) : null;

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const AUDIENCE = 'horizon-praticien';
const EMETTEUR = 'https://id.example/realms/horizon';
const b64 = objet => Buffer.from(JSON.stringify(objet)).toString('base64url');
const dans5min = () => Math.floor(Date.now() / 1000) + 300;

function jetonRS256(corps, { kid = 'fournisseur-test' } = {}) {
  const aSigner = `${b64({ alg: 'RS256', typ: 'JWT', kid })}.${b64(corps)}`;
  return `${aSigner}.${crypto.sign('RSA-SHA256', Buffer.from(aSigner), cles.privee).toString('base64url')}`;
}
function jetonHS256(corps, secret) {
  const aSigner = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(corps)}`;
  return `${aSigner}.${crypto.createHmac('sha256', secret).update(aSigner).digest('base64url')}`;
}
const praticien = (surcharge = {}) => jetonRS256({ sub: A, role: 'authenticated', aud: AUDIENCE, iss: EMETTEUR, exp: dans5min(), ...surcharge });
const lire = jeton => fetch(`${BASE}/participants?select=praticien_id`, { headers: { authorization: `Bearer ${jeton}` } });

test('un jeton de praticien signé par le fournisseur (RS256) ne lit que ses bénéficiaires', options, async () => {
  const rep = await lire(praticien());
  assert.equal(rep.status, 200);
  const lignes = await rep.json();
  assert.ok(lignes.length >= 1);
  assert.ok(lignes.every(l => l.praticien_id === A));
});

test('le jeton service_role signé par la clé du serveur (HS256) traverse la RLS', options, async () => {
  const rep = await lire(jetonHS256({ role: 'service_role', aud: AUDIENCE, exp: dans5min() }, Buffer.from(cles.secret, 'base64url')));
  assert.equal(rep.status, 200);
  const praticiens = new Set((await rep.json()).map(l => l.praticien_id));
  assert.ok(praticiens.size >= 2, 'le serveur doit voir les bénéficiaires de plusieurs praticiens');
});

test('refusés : confusion d\'algorithme, mauvaise audience, clé inconnue', options, async () => {
  // HS256 signé avec la clé PUBLIQUE du fournisseur prise pour secret : l'attaque classique.
  const corps = { sub: A, role: 'service_role', aud: AUDIENCE, exp: dans5min() };
  assert.equal((await lire(jetonHS256(corps, cles.publiquePem))).status, 401);
  assert.equal((await lire(jetonHS256(corps, Buffer.from(cles.publiqueJwk.n, 'base64url')))).status, 401);
  // Jeton du même fournisseur émis pour un autre client.
  assert.equal((await lire(praticien({ aud: 'account' }))).status, 401);
  // Signé par une autre clé RSA.
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const aSigner = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'fournisseur-test' })}.${b64({ sub: A, role: 'authenticated', aud: AUDIENCE, exp: dans5min() })}`;
  const faux = `${aSigner}.${crypto.sign('RSA-SHA256', Buffer.from(aSigner), privateKey).toString('base64url')}`;
  assert.equal((await lire(faux)).status, 401);
});

test('côté serveur, le même jeton de praticien est reconnu ; le jeton service_role ne passe pas pour un praticien', options, async () => {
  const verificateur = creerVerificateurJeton(
    { jwks: 'http://fournisseur.test/certs', secret: null, emetteur: EMETTEUR, audience: AUDIENCE },
    { requeter: async () => ({ ok: true, json: async () => ({ keys: [cles.publiqueJwk] }) }) },
  );
  assert.equal((await verificateur.getUser(praticien())).data.user?.id, A);
  assert.equal((await verificateur.getUser(praticien({ aud: 'account' }))).data.user, null);
  const service = jetonHS256({ role: 'service_role', aud: AUDIENCE, exp: dans5min() }, Buffer.from(cles.secret, 'base64url'));
  assert.equal((await verificateur.getUser(service)).data.user, null);
});
