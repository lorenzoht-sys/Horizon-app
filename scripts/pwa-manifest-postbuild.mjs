// scripts/pwa-manifest-postbuild.mjs
//
// Retire de dist/index.html le <link rel="manifest"> auto-injecté par
// vite-plugin-pwa (manifest.webmanifest, praticien) après un `vite build`
// complet.
//
// index.html pose déjà lui-même le bon <link rel="manifest"> au chargement,
// choisi selon la route (script inline en tête de index.html) : ce domaine
// sert deux publics avec deux points d'entrée "Sur l'écran d'accueil"
// différents — le praticien (start_url "/") et le patient (start_url
// "/patient", voir EspacePatient.tsx). Un seul manifeste figé pour les deux
// a déjà causé un bug réel : l'icône installée ouvrait l'espace patient
// même pour un praticien, Safari retenant le premier <link rel="manifest">
// du document (voir le rapport du chantier "fix PWA manifest").
//
// Pourquoi un script postbuild et pas un plugin Vite (closeBundle,
// transformIndexHtml) : les deux ont été essayés et se sont fait écraser —
// vite-plugin-pwa réécrit/finalise dist/index.html à un point de son propre
// cycle de build qui s'est avéré postérieur, quel que soit l'ordre déclaré
// entre plugins. Un process Node séparé, lancé APRÈS la fin complète de
// `vite build` (voir le script "build" dans package.json), élimine toute
// ambiguïté d'ordonnancement : rien ne peut plus toucher le fichier après.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../dist/index.html');

if (!existsSync(indexPath)) {
  throw new Error(`dist/index.html introuvable (${indexPath}) — build incomplet ?`);
}

const html = readFileSync(indexPath, 'utf-8');
const sansLienInjecte = html.replace(/\s*<link rel="manifest"[^>]*>/, '');

if (sansLienInjecte === html) {
  throw new Error(
    "Aucun <link rel=\"manifest\"> injecté trouvé dans dist/index.html — " +
    'soit vite-plugin-pwa ne l\'injecte plus (vérifier sa config), soit ce script est déjà inutile. ' +
    'Dans les deux cas, ne pas laisser passer silencieusement : un manifeste dupliqué ou absent ' +
    'casserait de nouveau "Sur l\'écran d\'accueil".'
  );
}

writeFileSync(indexPath, sansLienInjecte);
console.log('[pwa-manifest-postbuild] <link rel="manifest"> injecté par vite-plugin-pwa retiré de dist/index.html.');
