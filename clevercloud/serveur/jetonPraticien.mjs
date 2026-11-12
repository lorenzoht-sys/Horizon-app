// Vérification du jeton d'un praticien sur la cible Clever Cloud (2026-11-12,
// lot « connexion des praticiens » de la migration HDS).
//
// Aujourd'hui, six points du serveur (api/claude.ts, api/_lib/adminAuth.ts,
// api/_lib/patientSession.ts, api/seances/supprimer-planifiees.ts et deux
// Edge Functions) vérifient le jeton en appelant `supabase.auth.getUser(jeton)`,
// c'est-à-dire le service Supabase Auth. Sur la cible, ce service n'existe
// plus. Ce module fournit le même contrat (`getUser` renvoie `{ data: { user:
// { id, email } }, error }`) en vérifiant la signature du jeton localement.
// clientCompat.mjs le branche sur `client.auth` : les six points gardent leur
// code. Ils ne lisent que `user.id` et `user.email` (relevé du 2026-11-12).
//
// Indépendant du fournisseur d'identité retenu (la décision n'est pas prise) :
//   - AUTH_JWKS_URL   : clés publiques au format JWKS, jetons RS256. C'est le
//                       cas de Keycloak (…/realms/<realm>/protocol/openid-connect/certs).
//   - AUTH_JWT_SECRET : secret partagé, jetons HS256. C'est le cas d'une
//                       connexion gérée par l'application.
// Un seul des deux à la fois, et l'algorithme accepté découle de ce choix,
// jamais de l'en-tête du jeton : accepter les deux ouvrirait la confusion
// d'algorithme (un jeton HS256 signé avec la clé PUBLIQUE prise pour secret).
//
// Exigé d'un jeton : signature valide, `exp` présent et futur, `nbf` passé s'il
// existe, `iss` égal à AUTH_ISSUER et `aud` contenant AUTH_AUDIENCE quand ces
// variables sont posées, `sub` au format UUID. L'UUID est celui du praticien
// dans la base : les comptes doivent être importés en conservant leurs
// identifiants, sinon les politiques RLS (auth.uid()) ne reconnaîtraient plus
// personne.
//
// Différence assumée avec Supabase Auth : pas de révocation avant expiration
// (un jeton reste valide jusqu'à `exp` même après déconnexion). À compenser par
// une durée de vie courte des jetons d'accès côté fournisseur (5 minutes par
// défaut dans Keycloak).
//
// Les messages d'erreur ne contiennent jamais le jeton ni son contenu.

import crypto from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUREE_CACHE_JWKS_MS = 10 * 60_000;
// Tolérance d'horloge entre le fournisseur d'identité et l'application.
const TOLERANCE_S = 30;

export function configurationJeton(env = process.env) {
  const jwks = env.AUTH_JWKS_URL || null;
  const secret = env.AUTH_JWT_SECRET || null;
  if (!jwks && !secret) return null;
  if (jwks && secret) throw new Error('AUTH_JWKS_URL et AUTH_JWT_SECRET sont exclusifs : un seul mode de signature à la fois.');
  if (secret && secret.length < 32) throw new Error('AUTH_JWT_SECRET trop court (32 caractères au minimum).');
  return { jwks, secret, emetteur: env.AUTH_ISSUER || null, audience: env.AUTH_AUDIENCE || null };
}

const decoder = morceau => JSON.parse(Buffer.from(morceau, 'base64url').toString('utf8'));
const refus = message => ({ data: { user: null }, error: { message, status: 401 } });

export function creerVerificateurJeton(conf, { requeter = fetch, maintenant = () => Date.now() } = {}) {
  let cache = { cles: new Map(), lu: 0 };

  async function clePublique(kid) {
    const perime = maintenant() - cache.lu > DUREE_CACHE_JWKS_MS;
    // Clé inconnue : une relecture, pour suivre une rotation de clés, mais au
    // plus une par minute (un jeton forgé avec un `kid` aléatoire ne doit pas
    // faire interroger le fournisseur à chaque requête).
    const relireInconnue = !cache.cles.has(kid) && maintenant() - cache.lu > 60_000;
    if (perime || relireInconnue) {
      const rep = await requeter(conf.jwks);
      if (!rep.ok) throw new Error(`JWKS illisible (${rep.status})`);
      const cles = new Map();
      for (const jwk of (await rep.json()).keys ?? []) {
        if (jwk.kty === 'RSA' && jwk.kid && (jwk.use ?? 'sig') === 'sig') cles.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
      }
      cache = { cles, lu: maintenant() };
    }
    return cache.cles.get(kid) ?? null;
  }

  /** Même contrat que `supabase.auth.getUser(jeton)`. Ne lève jamais. */
  async function getUser(jeton) {
    try {
      const morceaux = typeof jeton === 'string' ? jeton.split('.') : [];
      if (morceaux.length !== 3 || morceaux.some(m => !m)) return refus('Jeton mal formé');
      const [enTete64, corps64, signature64] = morceaux;
      const enTete = decoder(enTete64);
      const signe = Buffer.from(`${enTete64}.${corps64}`);
      const signature = Buffer.from(signature64, 'base64url');

      if (conf.secret) {
        if (enTete.alg !== 'HS256') return refus('Algorithme refusé');
        const attendu = crypto.createHmac('sha256', conf.secret).update(signe).digest();
        if (attendu.length !== signature.length || !crypto.timingSafeEqual(attendu, signature)) return refus('Signature invalide');
      } else {
        if (enTete.alg !== 'RS256' || typeof enTete.kid !== 'string') return refus('Algorithme refusé');
        const cle = await clePublique(enTete.kid);
        if (!cle) return refus('Clé de signature inconnue');
        if (!crypto.verify('RSA-SHA256', signe, cle, signature)) return refus('Signature invalide');
      }

      const corps = decoder(corps64);
      const t = Math.floor(maintenant() / 1000);
      if (typeof corps.exp !== 'number' || corps.exp + TOLERANCE_S <= t) return refus('Jeton expiré');
      if (typeof corps.nbf === 'number' && corps.nbf - TOLERANCE_S > t) return refus('Jeton pas encore valide');
      if (conf.emetteur && corps.iss !== conf.emetteur) return refus('Émetteur inattendu');
      if (conf.audience && ![].concat(corps.aud ?? []).includes(conf.audience)) return refus('Audience inattendue');
      if (typeof corps.sub !== 'string' || !UUID.test(corps.sub)) return refus('Identifiant de praticien absent');

      return { data: { user: { id: corps.sub.toLowerCase(), email: typeof corps.email === 'string' ? corps.email : null } }, error: null };
    } catch (err) {
      // JSON illisible, base64 invalide, JWKS injoignable : refus, sans détail du jeton.
      return refus(err instanceof Error && err.message.startsWith('JWKS') ? err.message : 'Jeton illisible');
    }
  }

  // L'administration des comptes (api/organisation.ts : liste, invitation,
  // changement de rôle) dépend du fournisseur d'identité retenu : elle reste à
  // écrire. Un refus explicite vaut mieux qu'un appel silencieux à un service
  // qui n'existe pas sur la cible.
  const nonPrisEnCharge = async () => ({ data: null, error: { message: "Administration des comptes non disponible sur la cible : à brancher sur le fournisseur d'identité.", status: 501 } });
  const admin = new Proxy({}, { get: () => nonPrisEnCharge });

  return { getUser, admin };
}
