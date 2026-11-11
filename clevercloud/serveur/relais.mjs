// Relais vers PostgREST et lecture des factures pour le front praticien
// (2026-11-11, lots « routage /rest/v1 » et « stockage » de la migration HDS).
//
// `supabase-js` (front) appelle <url>/rest/v1/… et <url>/storage/v1/object/…
// Sur Clever Cloud, PostgREST répond à la racine de sa propre application et
// il n'y a pas d'API de stockage Supabase. Le serveur reprend donc ces deux
// chemins, pour que le front n'ait qu'une adresse à connaître et ne change pas :
//   /rest/v1/*                      → POSTGREST_URL/* (préfixe retiré)
//   /storage/v1/object/factures/*   → lecture dans Cellar, après contrôle RLS
// Actif seulement si POSTGREST_URL est défini.

import http from 'node:http';
import https from 'node:https';

// En-têtes propres à une connexion : jamais recopiés d'un côté à l'autre.
const SAUT = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);

/** Transmet la requête telle quelle à PostgREST, en flux, sans la lire. */
export function relayerVersPostgrest(req, res, url, base) {
  const cible = new URL(url.pathname.slice('/rest/v1'.length) || '/', base);
  cible.search = url.search;
  const entetes = Object.fromEntries(Object.entries(req.headers).filter(([n]) => !SAUT.has(n)));
  return new Promise((resolve, reject) => {
    const amont = (cible.protocol === 'https:' ? https : http).request(cible, { method: req.method, headers: entetes }, rep => {
      res.statusCode = rep.statusCode ?? 502;
      for (const [n, v] of Object.entries(rep.headers)) if (!SAUT.has(n) && v !== undefined) res.setHeader(n, v);
      rep.pipe(res);
      rep.on('end', resolve);
    });
    amont.on('error', reject);
    req.pipe(amont);
  });
}

/**
 * Téléchargement d'un PDF de facture par le praticien connecté. Le droit n'est
 * pas décidé ici : on demande à PostgREST, AVEC le jeton de l'appelant, si une
 * facture porte ce chemin. La RLS de `factures` répond ; sans ligne, 404 (même
 * réponse que le fichier existe ou non, pour ne rien révéler).
 */
export async function servirFacture(req, res, url, { base, stockage, requeter = fetch }) {
  const refus = (statut, message) => {
    res.statusCode = statut;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ statusCode: String(statut), error: message, message }));
  };
  if (req.method !== 'GET') return refus(405, 'Méthode non autorisée');
  const autorisation = req.headers.authorization;
  if (!autorisation) return refus(401, 'Authentification requise');
  let chemin;
  try {
    chemin = decodeURIComponent(url.pathname.slice('/storage/v1/object/factures/'.length));
  } catch {
    return refus(400, 'Chemin invalide');
  }
  if (!chemin || chemin.includes('..')) return refus(400, 'Chemin invalide');

  const controle = new URL('/factures', base);
  controle.searchParams.set('select', 'id');
  controle.searchParams.set('pdf_path', `eq.${chemin}`);
  controle.searchParams.set('limit', '1');
  const rep = await requeter(controle, { headers: { authorization: autorisation, ...(req.headers.apikey ? { apikey: req.headers.apikey } : {}) } });
  if (rep.status === 401) return refus(401, 'Session invalide ou expirée');
  const lignes = rep.ok ? await rep.json() : [];
  if (!Array.isArray(lignes) || lignes.length === 0) return refus(404, 'Object not found');

  const { data, error } = await stockage.from('factures').download(chemin);
  if (error || !data) return refus(404, 'Object not found');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(await data.arrayBuffer()));
}
