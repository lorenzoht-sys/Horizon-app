// Adaptateur req/res « façon Vercel » au-dessus de node:http (2026-11-09,
// socle Clever Cloud). Les 12 routes de api/ sont écrites pour les fonctions
// serverless Vercel ; on les exécute telles quelles, sans les modifier, pour
// que Vercel et Clever Cloud fassent tourner exactement le même code pendant
// la transition.
//
// Surface réellement utilisée par api/ (relevée le 2026-11-09) :
//   req.method, req.headers, req.query, req.body, req.socket
//   res.status(n).json(x), res.status(n).send(x), res.setHeader(k, v)
// Rien d'autre n'est émulé : une route qui utiliserait autre chose échouera
// bruyamment en staging plutôt que de se comporter différemment en silence.

const TAILLE_MAX_CORPS = 1_000_000; // 1 Mo : les routes n'échangent que du JSON court.

export class CorpsTropGros extends Error {}

/** Lit le corps et le décode comme Vercel : JSON, texte ou formulaire. */
export async function lireCorps(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const morceaux = [];
  let taille = 0;
  for await (const m of req) {
    taille += m.length;
    if (taille > TAILLE_MAX_CORPS) throw new CorpsTropGros();
    morceaux.push(m);
  }
  if (taille === 0) return undefined;
  const brut = Buffer.concat(morceaux).toString('utf8');
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    try {
      return JSON.parse(brut);
    } catch {
      return brut; // même tolérance que Vercel : la route décide quoi en faire.
    }
  }
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(brut));
  }
  return brut;
}

/**
 * Derrière les load balancers de Clever Cloud, X-Forwarded-For peut contenir
 * des valeurs fournies par le client, suivies de l'adresse vue par le load
 * balancer. getClientIp (api/_lib/patientAuth.ts) lit la PREMIÈRE valeur :
 * sans correction, un client pourrait choisir son IP et contourner la
 * limitation des tentatives de connexion patient. On ne garde donc que la
 * DERNIÈRE valeur, celle ajoutée par l'infrastructure.
 * À confirmer auprès de Clever Cloud (comportement exact de l'en-tête).
 */
export function normaliserIp(headers) {
  const fwd = headers['x-forwarded-for'];
  const valeur = Array.isArray(fwd) ? fwd.join(',') : fwd;
  if (typeof valeur === 'string' && valeur.trim()) {
    const ips = valeur.split(',').map(s => s.trim()).filter(Boolean);
    headers['x-forwarded-for'] = ips[ips.length - 1];
  }
}

/** Enrichit req et res avec la surface Vercel utilisée par api/. */
export async function adapter(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  req.body = await lireCorps(req);
  normaliserIp(req.headers);

  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = valeur => {
    if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(valeur));
    return res;
  };
  res.send = valeur => {
    if (valeur !== null && typeof valeur === 'object' && !Buffer.isBuffer(valeur)) return res.json(valeur);
    if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(valeur);
    return res;
  };
  return { req, res };
}
