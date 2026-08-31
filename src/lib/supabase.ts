import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Type du lien d'authentification par lequel la page a été ouverte :
// 'recovery' (mot de passe oublié), 'invite' (invitation), ou null.
//
// ── Pourquoi ce relevé est fait ICI, avant createClient ─────────────────
// Le client est configuré par défaut avec `detectSessionInUrl: true` : dès
// sa création, il lit le fragment `#access_token=…&type=recovery`, ouvre la
// session, PUIS EFFACE LE FRAGMENT de l'URL. Toute lecture ultérieure de
// `window.location.hash` — dans un composant, dans un effet — arrive trop
// tard et trouve une chaîne vide, de façon non déterministe.
//
// Ce module est évalué avant le premier rendu de React, et cette ligne
// s'exécute avant `createClient`. C'est le seul endroit où le relevé est
// fiable.
//
// ── Pourquoi on ne se contente pas de l'événement PASSWORD_RECOVERY ─────
// `onAuthStateChange` l'émet bien, mais `getSession()` peut résoudre avant
// et faire croire à une connexion ordinaire : c'est une course. Le relevé
// du fragment, lui, est décidé une fois pour toutes au chargement.
export type TypeLienAuth = 'recovery' | 'invite' | null;

/**
 * Lit le `type` d'un fragment d'URL Supabase.
 * Fonction pure et exportée pour être testable (src/lib/supabase.test.ts) :
 * le relevé réel se fait au chargement du module, impossible à rejouer.
 *
 * Ne reconnaît QUE 'recovery' et 'invite' — les deux cas où l'utilisateur
 * doit définir un mot de passe avant d'entrer. Tout autre type ('signup',
 * 'magiclink', 'email_change') retombe sur null et suit le flux normal.
 */
export function lireTypeLienAuth(fragment: string): TypeLienAuth {
  const t = new URLSearchParams(fragment.replace(/^#/, '')).get('type');
  return t === 'recovery' || t === 'invite' ? t : null;
}

export const typeLienAuth: TypeLienAuth = lireTypeLienAuth(
  typeof window !== 'undefined' ? window.location.hash : '',
);

/**
 * Erreur renvoyée par Supabase quand il REFUSE le lien : expiré, déjà
 * consommé, révoqué.
 *
 * ── Pourquoi il FAUT la lire ────────────────────────────────────────────
 * GoTrue renvoie l'échec À LA MÊME ADRESSE et dans le même fragment qu'un
 * succès, mais sans `type` et sans jeton :
 *
 *   #error=access_denied&error_code=otp_expired&error_description=…
 *
 * Tant que personne ne lit ces paramètres, un lien MORT et un lien FRAIS
 * sont indiscernables pour l'application : elle affiche le formulaire dans
 * les deux cas. C'est ce qui a fait conclure, pendant la recette de la
 * PR #22, qu'un lien de récupération restait réutilisable — alors que la
 * seule chose démontrée était que la PAGE s'affichait.
 *
 * auth-js lit bien ces paramètres et lève une erreur, mais elle reste
 * interne au client et n'est exposée à aucun appelant. D'où ce relevé.
 *
 * Même contrainte de placement que `typeLienAuth` : AVANT `createClient`,
 * qui efface le fragment.
 */
export type ErreurLienAuth = { code: string; description: string } | null;

/**
 * Lit l'erreur d'un retour d'authentification Supabase.
 * Pure et exportée pour être testable, comme `lireTypeLienAuth`.
 *
 * Le fragment porte le cas implicite ; la query string couvre les
 * redirections d'erreur émises côté serveur, qui n'ont pas de fragment.
 */
export function lireErreurLienAuth(fragment: string, requete = ''): ErreurLienAuth {
  const duFragment  = new URLSearchParams(fragment.replace(/^#/, ''));
  const deLaRequete = new URLSearchParams(requete.replace(/^\?/, ''));
  const lire = (cle: string) => deLaRequete.get(cle) ?? duFragment.get(cle);

  const erreur = lire('error');
  const code   = lire('error_code');
  if (!erreur && !code) return null;

  return {
    code: code ?? erreur ?? 'unspecified_error',
    description: lire('error_description') ?? '',
  };
}

export const erreurLienAuth: ErreurLienAuth = lireErreurLienAuth(
  typeof window !== 'undefined' ? window.location.hash : '',
  typeof window !== 'undefined' ? window.location.search : '',
);

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const isSupabaseConfigured = Boolean(supabase);

// En-tête Authorization à ajouter aux appels /api/claude (T6 — sécurisation
// Horizon) : le proxy IA vérifie cette session praticien avant d'utiliser
// la clé Anthropic. Objet vide si aucune session (le serveur renverra 401).
export async function getAuthHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
