// Serveur HTTP unique d'Horizon pour Clever Cloud (2026-11-09, socle de la
// migration HDS). Il remplace ce que fait Vercel aujourd'hui :
//   - exécuter les routes de api/ (compilées dans dist-api/ par le Dockerfile) ;
//   - exécuter les Edge Functions de supabase/functions/ (compatDeno.mjs) ;
//   - servir le front statique (dist/) avec la réécriture SPA ;
//   - appliquer les en-têtes de sécurité de vercel.json, lus tels quels pour
//     qu'il n'existe qu'UNE définition de la CSP et des autres en-têtes.
// Contraintes Clever Cloud : HTTP simple (TLS terminé par les load balancers),
// port 8080 ou CC_DOCKER_EXPOSED_HTTP_PORT, aucune écriture sur disque.
//
// Sans dépendance npm : node:http suffit, et chaque dépendance en moins est
// une chose de moins à auditer pour le dossier HDS.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adapter, CorpsTropGros, normaliserIp } from './compatVercel.mjs';
import { demarrerCronInterne } from './cron.mjs';
import { installerCrochets, chargerFonctions, executerFonction } from './compatDeno.mjs';
import { relayerVersPostgrest, servirFacture } from './relais.mjs';
import { configurationS3, creerStockageS3 } from './stockageS3.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '../..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.pdf': 'application/pdf', '.wasm': 'application/wasm',
};

/**
 * Plusieurs routes masquent le détail des erreurs quand VERCEL_ENV vaut
 * « production » (ex. api/patient/retour-seance.ts). Hors Vercel cette
 * variable n'existe pas : sans ce garde-fou, la production Clever Cloud
 * renverrait les messages d'erreur Postgres au navigateur. On exige donc
 * APP_ENV et on en déduit VERCEL_ENV, sans toucher aux routes.
 */
export function verifierEnvironnement(env = process.env) {
  const appEnv = env.APP_ENV;
  if (appEnv !== 'production' && appEnv !== 'staging' && appEnv !== 'development') {
    throw new Error('APP_ENV doit valoir production, staging ou development.');
  }
  if (!env.VERCEL_ENV) env.VERCEL_ENV = appEnv === 'staging' ? 'preview' : appEnv;
  return appEnv;
}

/** Règles d'en-têtes de vercel.json, compilées en expressions régulières. */
export function chargerEnTetes(fichier = path.join(RACINE, 'vercel.json')) {
  const conf = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  return (conf.headers ?? []).map(r => ({ motif: new RegExp(`^${r.source}$`), entetes: r.headers }));
}

export function appliquerEnTetes(regles, chemin, res) {
  for (const r of regles) {
    if (r.motif.test(chemin)) for (const { key, value } of r.entetes) res.setHeader(key, value);
  }
}

/**
 * Table des routes : un fichier compilé = une route, comme sur Vercel.
 * Exclut _lib/ et les fichiers préfixés « _ » (tests unitaires).
 */
export function listerRoutes(dossierApi) {
  const routes = new Map();
  const parcourir = rel => {
    for (const nom of fs.readdirSync(path.join(dossierApi, rel))) {
      if (nom.startsWith('_')) continue;
      const relNom = rel ? `${rel}/${nom}` : nom;
      const complet = path.join(dossierApi, relNom);
      if (fs.statSync(complet).isDirectory()) parcourir(relNom);
      else if (nom.endsWith('.js') && !nom.endsWith('.test.js')) routes.set(`/api/${relNom.slice(0, -3)}`, complet);
    }
  };
  if (fs.existsSync(dossierApi)) parcourir('');
  return routes;
}

function fichierStatique(dossier, chemin) {
  let rel;
  try {
    rel = decodeURIComponent(chemin);
  } catch {
    return null;
  }
  const complet = path.resolve(dossier, `.${rel}`);
  if (!complet.startsWith(dossier + path.sep)) return null; // pas de sortie du dossier
  try {
    return fs.statSync(complet).isFile() ? complet : null;
  } catch {
    return null;
  }
}

function servirFichier(res, fichier, methode) {
  const ext = path.extname(fichier).toLowerCase();
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  // Les fichiers de dist/assets/ portent une empreinte dans leur nom : cache long.
  // Tout le reste (index.html, service workers, manifestes) est revalidé.
  res.setHeader('Cache-Control', fichier.includes(`${path.sep}assets${path.sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache');
  if (methode === 'HEAD') return res.end();
  fs.createReadStream(fichier).pipe(res);
}

export function creerServeur({
  dossierApi = process.env.DOSSIER_API ?? path.join(RACINE, 'dist-api', 'api'),
  dossierStatique = process.env.DOSSIER_STATIQUE ?? path.join(RACINE, 'dist'),
  servirFront = process.env.SERVIR_FRONT !== '0',
  dossierFonctions = process.env.DOSSIER_FONCTIONS ?? path.join(RACINE, 'supabase', 'functions'),
  postgrest = process.env.POSTGREST_URL,
  stockage = (c => (c ? creerStockageS3(c) : null))(configurationS3()),
  regles = chargerEnTetes(),
} = {}) {
  const routes = listerRoutes(dossierApi);
  const modules = new Map();
  // Edge Functions : chargées au premier appel (une fonction qui ne se charge
  // pas ne doit pas empêcher le reste du serveur de démarrer).
  installerCrochets([dossierApi, dossierFonctions]);
  let fonctions;
  const statique = path.resolve(dossierStatique);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const chemin = url.pathname;
    try {
      // Sonde de santé pour la plateforme : ne touche pas la base.
      if (chemin === '/__sante') {
        res.statusCode = 200;
        return res.end('ok');
      }
      appliquerEnTetes(regles, chemin, res);

      if (chemin === '/api' || chemin.startsWith('/api/')) {
        const fichier = routes.get(chemin.replace(/\/+$/, ''));
        if (!fichier) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.end(JSON.stringify({ error: 'Route inconnue' }));
        }
        if (!modules.has(fichier)) modules.set(fichier, import(pathToFileURL(fichier).href));
        const handler = (await modules.get(fichier)).default;
        await adapter(req, res, url);
        await handler(req, res);
        return;
      }

      // Chemins attendus par supabase-js côté front (voir relais.mjs).
      if (postgrest && (chemin === '/rest/v1' || chemin.startsWith('/rest/v1/'))) {
        return await relayerVersPostgrest(req, res, url, postgrest);
      }
      if (postgrest && stockage && chemin.startsWith('/storage/v1/object/factures/')) {
        return await servirFacture(req, res, url, { base: postgrest, stockage });
      }

      if (chemin.startsWith('/functions/v1/')) {
        fonctions ??= chargerFonctions(dossierFonctions);
        const traitement = (await fonctions).get(chemin.slice('/functions/v1/'.length).replace(/\/+$/, ''));
        if (!traitement) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.end(JSON.stringify({ error: 'Fonction inconnue' }));
        }
        normaliserIp(req.headers);
        return await executerFonction(traitement, req, res, url);
      }

      if (!servirFront || (req.method !== 'GET' && req.method !== 'HEAD')) {
        res.statusCode = servirFront ? 405 : 404;
        return res.end();
      }
      const fichier = chemin === '/' ? null : fichierStatique(statique, chemin);
      // Réécriture SPA de vercel.json : tout chemin inconnu sert index.html.
      return servirFichier(res, fichier ?? path.join(statique, 'index.html'), req.method);
    } catch (err) {
      if (err instanceof CorpsTropGros) {
        res.statusCode = 413;
        return res.end();
      }
      // Jamais de détail vers le client : le message peut contenir des données.
      console.error(`[serveur] ${req.method} ${chemin} : ${err?.name ?? 'Erreur'}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Erreur serveur' }));
      } else {
        res.end();
      }
    }
  });
}

// Lancement direct (et non import par les tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appEnv = verifierEnvironnement();
  const port = Number(process.env.CC_DOCKER_EXPOSED_HTTP_PORT ?? process.env.PORT ?? 8080);
  const serveur = creerServeur();
  serveur.listen(port, () => {
    console.log(`[serveur] Horizon (${appEnv}) en écoute sur le port ${port}`);
    demarrerCronInterne({ port });
  });
  // Clever Cloud démarre la nouvelle instance avant d'arrêter l'ancienne :
  // on termine proprement les requêtes en cours.
  process.on('SIGTERM', () => serveur.close(() => process.exit(0)));
}
