// Client Supabase vu par les routes api/ et les Edge Functions sur Clever
// Cloud. C'est le client réel (PostgREST, RPC), sauf deux propriétés :
//   - `storage` : quand un add-on Cellar est configuré, remplacé par
//     stockageS3.mjs. Les routes et les fonctions continuent d'écrire
//     `client.storage.from('factures')` ;
//   - `auth` : quand AUTH_JWKS_URL ou AUTH_JWT_SECRET est posé, remplacé par
//     jetonPraticien.mjs, qui vérifie le jeton localement. Les six points qui
//     appellent `client.auth.getUser(jeton)` gardent leur code (2026-11-12).
// Sans ces variables, le client réel est rendu tel quel : rien ne change sur
// un environnement qui parle encore à Supabase.
//
// Le module réel est désigné par crochetsModules.mjs (paramètre `reel`).

import { configurationS3, creerStockageS3 } from './stockageS3.mjs';
import { configurationJeton, creerVerificateurJeton } from './jetonPraticien.mjs';

const reel = await import(new URL(import.meta.url).searchParams.get('reel'));
const confS3 = configurationS3();
const stockage = confS3 ? creerStockageS3(confS3) : null;
// Un seul vérificateur pour tout le processus : il porte le cache des clés.
const confJeton = configurationJeton();
const auth = confJeton ? creerVerificateurJeton(confJeton) : null;

export function createClient(...args) {
  const client = reel.createClient(...args);
  if (!stockage && !auth) return client;
  return new Proxy(client, {
    get(cible, prop) {
      if (prop === 'storage' && stockage) return stockage;
      if (prop === 'auth' && auth) return auth;
      const valeur = Reflect.get(cible, prop, cible);
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
    },
  });
}
