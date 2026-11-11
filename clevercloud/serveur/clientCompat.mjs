// Client Supabase vu par les routes api/ et les Edge Functions sur Clever
// Cloud. C'est le client réel (PostgREST, RPC), sauf `storage` : quand un
// add-on Cellar est configuré, il est remplacé par stockageS3.mjs. Les routes
// et les fonctions continuent d'écrire `client.storage.from('factures')`.
//
// Le module réel est désigné par crochetsModules.mjs (paramètre `reel`).

import { configurationS3, creerStockageS3 } from './stockageS3.mjs';

const reel = await import(new URL(import.meta.url).searchParams.get('reel'));
const confS3 = configurationS3();
const stockage = confS3 ? creerStockageS3(confS3) : null;

export function createClient(...args) {
  const client = reel.createClient(...args);
  if (!stockage) return client;
  return new Proxy(client, {
    get(cible, prop) {
      if (prop === 'storage') return stockage;
      const valeur = Reflect.get(cible, prop, cible);
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur;
    },
  });
}
