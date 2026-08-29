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
