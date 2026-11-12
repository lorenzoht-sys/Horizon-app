// `node --test clevercloud/serveur/` : vérification locale du jeton praticien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { configurationJeton, creerVerificateurJeton } from './jetonPraticien.mjs';

const SUB = '3f2b8a0e-5c1d-4e7a-9b6f-0a1b2c3d4e5f';
const SECRET = 'secret-de-test-de-plus-de-32-caracteres!';
const b64 = objet => Buffer.from(JSON.stringify(objet)).toString('base64url');
const dans = s => Math.floor(Date.now() / 1000) + s;

function hs256(corps, secret = SECRET, enTete = { alg: 'HS256', typ: 'JWT' }) {
  const base = `${b64(enTete)}.${b64(corps)}`;
  return `${base}.${crypto.createHmac('sha256', secret).update(base).digest('base64url')}`;
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'cle-1', use: 'sig', alg: 'RS256' };
function rs256(corps, { cle = privateKey, kid = 'cle-1', alg = 'RS256' } = {}) {
  const base = `${b64({ alg, kid, typ: 'JWT' })}.${b64(corps)}`;
  return `${base}.${crypto.sign('RSA-SHA256', Buffer.from(base), cle).toString('base64url')}`;
}
function fauxJwks(cles = [JWK]) {
  const etat = { lectures: 0 };
  const requeter = async () => { etat.lectures++; return { ok: true, status: 200, json: async () => ({ keys: cles }) }; };
  return { etat, requeter };
}

test('configuration : rien, un mode, jamais les deux ; secret court refusé', () => {
  assert.equal(configurationJeton({}), null);
  assert.deepEqual(configurationJeton({ AUTH_JWT_SECRET: SECRET }), { jwks: null, secret: SECRET, emetteur: null, audience: null });
  assert.throws(() => configurationJeton({ AUTH_JWT_SECRET: SECRET, AUTH_JWKS_URL: 'http://x' }), /exclusifs/);
  assert.throws(() => configurationJeton({ AUTH_JWT_SECRET: 'court' }), /trop court/);
});

test('HS256 : jeton valide → même forme que supabase.auth.getUser', async () => {
  const v = creerVerificateurJeton({ secret: SECRET });
  const r = await v.getUser(hs256({ sub: SUB.toUpperCase(), email: 'p@example.com', exp: dans(300) }));
  assert.deepEqual(r, { data: { user: { id: SUB, email: 'p@example.com' } }, error: null });
});

test('HS256 : refus (signature, expiration, nbf, sub, forme), sans jamais lever', async () => {
  const v = creerVerificateurJeton({ secret: SECRET });
  const cas = {
    'autre secret': hs256({ sub: SUB, exp: dans(300) }, 'un-autre-secret-de-plus-de-32-caracteres'),
    'expiré': hs256({ sub: SUB, exp: dans(-120) }),
    'sans exp': hs256({ sub: SUB }),
    'pas encore valide': hs256({ sub: SUB, exp: dans(300), nbf: dans(120) }),
    'sub non UUID': hs256({ sub: 'admin', exp: dans(300) }),
    'sans sub': hs256({ exp: dans(300) }),
    'alg none': `${b64({ alg: 'none' })}.${b64({ sub: SUB, exp: dans(300) })}.`,
    'deux morceaux': 'a.b',
    'pas une chaîne': undefined,
    'base64 illisible': 'é.é.é',
  };
  for (const [nom, jeton] of Object.entries(cas)) {
    const r = await v.getUser(jeton);
    assert.equal(r.data.user, null, nom);
    assert.equal(r.error.status, 401, nom);
  }
  // Corps modifié après signature.
  const [e, , s] = hs256({ sub: SUB, exp: dans(300) }).split('.');
  const falsifie = `${e}.${b64({ sub: '11111111-1111-4111-8111-111111111111', exp: dans(300) })}.${s}`;
  assert.equal((await v.getUser(falsifie)).error.message, 'Signature invalide');
});

test('émetteur et audience exigés quand ils sont configurés', async () => {
  const v = creerVerificateurJeton({ secret: SECRET, emetteur: 'https://id.example/realms/horizon', audience: 'horizon' });
  const bon = { sub: SUB, exp: dans(300), iss: 'https://id.example/realms/horizon', aud: ['account', 'horizon'] };
  assert.equal((await v.getUser(hs256(bon))).error, null);
  assert.equal((await v.getUser(hs256({ ...bon, iss: 'https://ailleurs' }))).error.message, 'Émetteur inattendu');
  assert.equal((await v.getUser(hs256({ ...bon, aud: 'account' }))).error.message, 'Audience inattendue');
});

test('RS256 par JWKS : valide, clé inconnue, mauvaise clé, cache', async () => {
  const { etat, requeter } = fauxJwks();
  const v = creerVerificateurJeton({ jwks: 'http://id/certs' }, { requeter });
  const jeton = rs256({ sub: SUB, email: 'p@example.com', exp: dans(300) });
  assert.deepEqual((await v.getUser(jeton)).data.user, { id: SUB, email: 'p@example.com' });
  await v.getUser(jeton);
  assert.equal(etat.lectures, 1, 'le JWKS est mis en cache');

  const autre = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.equal((await v.getUser(rs256({ sub: SUB, exp: dans(300) }, { cle: autre }))).error.message, 'Signature invalide');
  assert.equal((await v.getUser(rs256({ sub: SUB, exp: dans(300) }, { kid: 'inconnue' }))).error.message, 'Clé de signature inconnue');
  // Un `kid` inconnu ne fait pas relire le JWKS à chaque requête.
  await v.getUser(rs256({ sub: SUB, exp: dans(300) }, { kid: 'inconnue-2' }));
  assert.equal(etat.lectures, 1);
});

test('confusion d\'algorithme : en mode JWKS, un jeton HS256 signé avec la clé publique est refusé', async () => {
  const { requeter } = fauxJwks();
  const v = creerVerificateurJeton({ jwks: 'http://id/certs' }, { requeter });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const forge = hs256({ sub: SUB, exp: dans(300) }, pem, { alg: 'HS256', kid: 'cle-1' });
  assert.equal((await v.getUser(forge)).error.message, 'Algorithme refusé');
  // Et l'inverse : en mode secret, un jeton RS256 est refusé.
  const s = creerVerificateurJeton({ secret: SECRET });
  assert.equal((await s.getUser(rs256({ sub: SUB, exp: dans(300) }))).error.message, 'Algorithme refusé');
});

test('rotation : une clé apparue après la mise en cache est trouvée à la relecture suivante', async () => {
  let t = Date.now();
  const cles = [];
  const { etat, requeter } = fauxJwks(cles);
  const v = creerVerificateurJeton({ jwks: 'http://id/certs' }, { requeter, maintenant: () => t });
  const jeton = rs256({ sub: SUB, exp: dans(3600) });
  assert.equal((await v.getUser(jeton)).error.message, 'Clé de signature inconnue');
  cles.push(JWK);
  assert.equal((await v.getUser(jeton)).error.message, 'Clé de signature inconnue', 'pas de relecture immédiate');
  t += 61_000;
  assert.equal((await v.getUser(jeton)).error, null);
  assert.equal(etat.lectures, 2);
});

test('JWKS injoignable : refus, pas d\'exception ; administration des comptes : refus explicite', async () => {
  const v = creerVerificateurJeton({ jwks: 'http://id/certs' }, { requeter: async () => ({ ok: false, status: 503 }) });
  const r = await v.getUser(rs256({ sub: SUB, exp: dans(300) }));
  assert.equal(r.data.user, null);
  assert.match(r.error.message, /JWKS illisible \(503\)/);
  const admin = await v.admin.listUsers({ perPage: 10 });
  assert.equal(admin.data, null);
  assert.equal(admin.error.status, 501);
});
