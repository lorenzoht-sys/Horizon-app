import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Praticien connecté, ou null (pas de session, ou Supabase non configuré).
 *
 * ── Pourquoi ce point d'entrée unique (2026-11-10) ──────────────────────
 * 31 endroits du front appelaient `supabase.auth.getUser()` directement,
 * dans 20 fichiers. Pour la migration HDS, la connexion des praticiens doit
 * quitter Supabase Auth (Keycloak ou autre) : avec cet unique point d'entrée,
 * ce changement se fait ici, pas dans 20 fichiers.
 *
 * Comportement inchangé : même appel, même résultat (`data.user`).
 * Seule différence : renvoie null au lieu de lever une erreur si le client
 * Supabase n'est pas configuré.
 *
 * Tout nouveau code qui a besoin de l'identité du praticien passe par ici,
 * jamais par `supabase.auth.getUser()`.
 */
export async function utilisateurCourant(): Promise<User | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
