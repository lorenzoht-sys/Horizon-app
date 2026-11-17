#!/usr/bin/env node
// Mesure du poids du front construit (dist/), pour suivre le nettoyage
// (docs/NETTOYAGE.md). À lancer après `npm run build` :
//   node scripts/mesurer-poids.mjs            → tableau des fichiers
//   node scripts/mesurer-poids.mjs --json     → même chose en JSON
//
// Ce qui compte pour l'utilisateur, c'est le poids COMPRESSÉ (gzip) du
// paquet chargé au démarrage (index-*.js) : il est téléchargé par tous,
// patients sur mobile compris, avant le premier affichage. Les autres
// fichiers ne sont chargés qu'à l'ouverture de la page concernée, mais le
// service worker de la PWA les précharge tous (« precache »).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DOSSIER = path.resolve(process.argv.find(a => a.startsWith('--dist='))?.slice(7) ?? 'dist');
const ASSETS = path.join(DOSSIER, 'assets');

if (!fs.existsSync(ASSETS)) {
  console.error(`Aucun dossier ${ASSETS} : lancer d'abord « npm run build ».`);
  process.exit(1);
}

const ko = n => Math.round(n / 1024);
const fichiers = fs.readdirSync(ASSETS)
  .filter(f => /\.(m?js|css)$/.test(f))
  .map(f => {
    const contenu = fs.readFileSync(path.join(ASSETS, f));
    return { fichier: f, brut: contenu.length, gzip: zlib.gzipSync(contenu, { level: 9 }).length };
  })
  .sort((a, b) => b.gzip - a.gzip);

const total = fichiers.reduce((s, f) => ({ brut: s.brut + f.brut, gzip: s.gzip + f.gzip }), { brut: 0, gzip: 0 });
const demarrage = fichiers.filter(f => /^index-.*\.(js|css)$/.test(f.fichier));
const totalDemarrage = demarrage.reduce((s, f) => s + f.gzip, 0);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ demarrageGzip: totalDemarrage, total, fichiers }, null, 2));
} else {
  console.log(`Chargé au démarrage (index-*) : ${ko(totalDemarrage)} Ko compressés`);
  console.log(`Ensemble du front (précache PWA) : ${ko(total.brut)} Ko bruts, ${ko(total.gzip)} Ko compressés\n`);
  console.log('   gzip      brut  fichier');
  for (const f of fichiers.slice(0, 15)) {
    console.log(`${String(ko(f.gzip)).padStart(7)} Ko ${String(ko(f.brut)).padStart(6)} Ko  ${f.fichier}`);
  }
}
