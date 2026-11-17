#!/usr/bin/env node
// Vérifie que l'image Clever Cloud a tout ce qu'il faut pour tourner avec les
// seules `dependencies` de package.json (nettoyage, lot 2, 2026-11-17).
//
// Depuis ce lot, `dependencies` ne liste que ce que le SERVEUR charge à
// l'exécution ; les bibliothèques du front (React, PDF, Excel, carte…) sont
// en `devDependencies` : Vite les empaquette au build, et le Dockerfile les
// retire ensuite (`npm prune --omit=dev`), ce qui fait passer node_modules
// de 545 à ≈ 150 Mo. Le risque : une route qui importe une bibliothèque
// restée en devDependencies tomberait en panne en production seulement.
//
// À lancer APRÈS `npx tsc -p clevercloud/tsconfig.api-build.json` et
// `npm prune --omit=dev` (job `serveur-clevercloud` de la CI) :
//   1. chaque route compilée (dist-api/api/**) est importée pour de vrai ;
//   2. chaque import nu du serveur et des Edge Functions doit être déclaré
//      dans `dependencies` et présent dans node_modules.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const RACINE = process.cwd();
const require = createRequire(path.join(RACINE, 'package.json'));
const declarees = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).dependencies ?? {}));
const erreurs = [];

function fichiers(dossier, motif) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return fichiers(p, motif);
    return motif.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

// Nom du paquet d'un import nu (« @a/b/c » → « @a/b », « x/y » → « x »),
// ou null pour les modules intégrés et les adresses que le serveur ramène
// lui-même aux modules installés (voir clevercloud/serveur/crochetsModules.mjs).
function paquetDe(specifier) {
  if (specifier.startsWith('node:') || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  const esm = specifier.match(/^https:\/\/esm\.sh\/((?:@[^/]+\/)?[^@/]+)/);
  if (esm) return esm[1];
  if (/^https?:\/\//.test(specifier)) return null;
  const morceaux = specifier.split('/');
  return specifier.startsWith('@') ? morceaux.slice(0, 2).join('/') : morceaux[0];
}

// 1. Les routes compilées, importées comme le fait le serveur.
const routes = fichiers(path.join(RACINE, 'dist-api', 'api'), /\.js$/)
  .filter(f => !f.includes(`${path.sep}_lib${path.sep}`) && !path.basename(f).startsWith('_'));
if (routes.length === 0) erreurs.push('dist-api/api est vide : compiler api/ avant (tsconfig.api-build.json).');
for (const route of routes) {
  try {
    await import(pathToFileURL(route).href);
  } catch (err) {
    erreurs.push(`${path.relative(RACINE, route)} : ${err.code ?? err.name} ${err.message.split('\n')[0]}`);
  }
}

// 2. Les imports nus du serveur et des Edge Functions.
const sources = [
  ...fichiers(path.join(RACINE, 'clevercloud', 'serveur'), /\.mjs$/),
  ...fichiers(path.join(RACINE, 'supabase', 'functions'), /\.ts$/),
];
const IMPORT = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
for (const fichier of sources) {
  for (const [, specifier] of fs.readFileSync(fichier, 'utf8').matchAll(IMPORT)) {
    const paquet = paquetDe(specifier);
    if (!paquet) continue;
    const ou = path.relative(RACINE, fichier);
    if (!declarees.has(paquet)) erreurs.push(`${ou} : « ${paquet} » n'est pas dans dependencies`);
    try {
      require.resolve(`${paquet}/package.json`);
    } catch {
      try { require.resolve(paquet); } catch { erreurs.push(`${ou} : « ${paquet} » absent de node_modules`); }
    }
  }
}

if (erreurs.length) {
  console.error(`Dépendances du serveur : ${erreurs.length} problème(s)`);
  for (const e of [...new Set(erreurs)]) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Dépendances du serveur : ${routes.length} routes importées, ${sources.length} fichiers du serveur et des fonctions vérifiés.`);
