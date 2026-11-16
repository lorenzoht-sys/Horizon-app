#!/usr/bin/env node
// Clés de TEST pour la répétition « mode Keycloak » (2026-11-16, migration HDS).
// Tirées au hasard à chaque exécution, écrites dans un dossier temporaire de la
// CI : rien de fixe dans le dépôt, rien de réutilisable.
//
// Usage : node clevercloud/scripts/cles-repetition.mjs <dossier>
// Écrit :
//   jwks.json    ce que reçoit PostgREST dans PGRST_JWT_SECRET : la clé PUBLIQUE
//                du fournisseur d'identité (RSA) et la clé du serveur (oct) ;
//   cles.json    de quoi signer les jetons du test (clé privée RSA, secret).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dossier = process.argv[2];
if (!dossier) {
  console.error('Usage : node clevercloud/scripts/cles-repetition.mjs <dossier>');
  process.exit(2);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const secret = crypto.randomBytes(48);
const publique = { ...publicKey.export({ format: 'jwk' }), kid: 'fournisseur-test', use: 'sig', alg: 'RS256' };
const serveur = { kty: 'oct', k: secret.toString('base64url'), kid: 'serveur-test', use: 'sig', alg: 'HS256' };

fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(dossier, 'jwks.json'), JSON.stringify({ keys: [publique, serveur] }), { mode: 0o600 });
fs.writeFileSync(path.join(dossier, 'cles.json'), JSON.stringify({
  privee: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  publiquePem: publicKey.export({ format: 'pem', type: 'spki' }),
  publiqueJwk: publique,
  secret: secret.toString('base64url'),
}), { mode: 0o600 });
