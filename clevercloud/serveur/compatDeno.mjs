// Exécution des Edge Functions Supabase (supabase/functions/, écrites pour
// Deno) dans le serveur Node, sans les modifier (2026-11-11, lot « Edge
// Functions » de la migration HDS). Même principe que compatVercel.mjs :
// Supabase et Clever Cloud font tourner le même code pendant la transition.
//
// Ce qu'une fonction attend de Deno (relevé le 2026-11-11) :
//   Deno.env.get(nom), Deno.serve(traitement) ou `serve` de la bibliothèque
//   standard, des imports par URL, des fichiers TypeScript importés avec leur
//   extension. Request, Response, fetch et crypto.subtle existent dans Node.
// Le TypeScript est lu directement par Node (retrait des types, Node >= 22.18).
//
// Les fonctions sont servies sous /functions/v1/<nom>, le chemin qu'appelle
// `supabase.functions.invoke` : le front n'a pas à changer.

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const TAILLE_MAX_CORPS = 1_000_000;
let crochetsInstalles = false;

/** Installe les crochets de résolution. `perimetre` : dossiers dont le client Supabase est adapté. */
export function installerCrochets(perimetre) {
  if (crochetsInstalles) return;
  crochetsInstalles = true;
  register('./crochetsModules.mjs', import.meta.url, {
    data: {
      perimetre: perimetre.map(d => pathToFileURL(path.resolve(d) + path.sep).href),
      clientCompat: new URL('./clientCompat.mjs', import.meta.url).href,
      stdServeur: new URL('./stdServeurDeno.mjs', import.meta.url).href,
    },
  });
}

/**
 * Charge chaque dossier de `dossierFonctions` qui contient un index.ts et
 * renvoie nom → traitement (Request → Response). Une fonction s'enregistre en
 * appelant Deno.serve pendant son import : on les importe donc une par une.
 */
export async function chargerFonctions(dossierFonctions, env = process.env) {
  const fonctions = new Map();
  if (!fs.existsSync(dossierFonctions)) return fonctions;
  let enregistre = null;
  globalThis.Deno = {
    env: { get: nom => env[nom] },
    serve: traitement => { enregistre = traitement; },
  };
  for (const nom of fs.readdirSync(dossierFonctions).sort()) {
    const index = path.join(dossierFonctions, nom, 'index.ts');
    if (nom.startsWith('_') || !fs.existsSync(index)) continue;
    enregistre = null;
    await import(pathToFileURL(index).href);
    if (typeof enregistre !== 'function') throw new Error(`La fonction ${nom} n'a pas appelé Deno.serve.`);
    fonctions.set(nom, enregistre);
  }
  return fonctions;
}

/** Passe une requête node:http à une fonction et écrit sa réponse. */
export async function executerFonction(traitement, req, res, url) {
  let corps;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const morceaux = [];
    let taille = 0;
    for await (const m of req) {
      taille += m.length;
      if (taille > TAILLE_MAX_CORPS) {
        res.statusCode = 413;
        return res.end();
      }
      morceaux.push(m);
    }
    corps = Buffer.concat(morceaux);
  }
  const entetes = new Headers();
  for (const [nom, valeur] of Object.entries(req.headers)) {
    if (valeur !== undefined) entetes.set(nom, Array.isArray(valeur) ? valeur.join(', ') : valeur);
  }
  const requete = new Request(`http://${req.headers.host ?? 'local'}${url.pathname}${url.search}`, {
    method: req.method, headers: entetes, body: corps?.length ? corps : undefined,
  });
  const reponse = await traitement(requete);
  res.statusCode = reponse.status;
  reponse.headers.forEach((valeur, nom) => res.setHeader(nom, valeur));
  res.end(Buffer.from(await reponse.arrayBuffer()));
}
