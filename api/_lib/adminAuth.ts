// api/_lib/adminAuth.ts
//
// Vérification du rôle administrateur pour les actions `admin.*` de
// api/organisation.ts (étape 4 des rôles).
//
// ── Le rôle est lu en base, JAMAIS dans le jeton ────────────────────────
// C'est la décision prise à l'étape 3 (voir l'en-tête de
// 20260827_roles_01_user_roles.sql) et elle se paie ici : un claim JWT
// personnalisé resterait périmé jusqu'à la prochaine connexion, donc une
// révocation d'admin ne prendrait pas effet avant des heures. En lisant
// `user_roles` par `service_role` à chaque appel, retirer le rôle coupe
// l'accès au requête suivante.
//
// ── Pourquoi service_role et pas le client de l'appelant ────────────────
// Un admin peut lire sa propre ligne `user_roles` (policy de l'étape 3),
// donc lire le rôle avec son propre jeton fonctionnerait. Mais ça ferait
// dépendre une décision d'autorisation d'une policy RLS : le jour où cette
// policy change, l'autorisation change avec elle, silencieusement.
// `service_role` lit la table telle qu'elle est, sans intermédiaire.
//
// ── Ce fichier vit dans _lib/, volontairement ───────────────────────────
// Le plan Vercel Hobby plafonne à 12 fonctions serverless et le projet en
// compte 12. Tout fichier de `api/` qui n'est pas dans `_lib/` en serait
// une treizième et casserait le déploiement — d'où le regroupement des
// actions admin dans api/organisation.ts par dispatch, et ce helper ici.

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken } from './patientAuth.js';

type RequeteAvecEntetes = {
  headers: Record<string, string | string[] | undefined>;
};

export type AdminRefuse = { ok: false; status: number; error: string };
export type AdminAutorise = { ok: true; userId: string; email: string | null };

/**
 * Exige un appelant authentifié dont `user_roles.app_role` vaut 'admin'.
 * Ne renvoie jamais d'exception : le refus est une valeur, pour que
 * l'appelant choisisse le code HTTP sans try/catch.
 */
export async function exigerAdmin(
  req: RequeteAvecEntetes,
  supabase: SupabaseClient,
): Promise<AdminAutorise | AdminRefuse> {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Authentification requise' };
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: 'Session invalide ou expirée' };
  }

  const userId = userData.user.id;

  const { data: role, error: roleErr } = await supabase
    .from('user_roles')
    .select('app_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (roleErr) {
    return { ok: false, status: 500, error: 'Erreur de vérification du rôle' };
  }

  // Message volontairement identique pour « pas de ligne de rôle » et
  // « rôle praticien » : un appelant non-admin n'a aucune raison d'apprendre
  // si le rôle existe, ni lequel c'est.
  if (role?.app_role !== 'admin') {
    return { ok: false, status: 403, error: 'Accès réservé aux administrateurs' };
  }

  return { ok: true, userId, email: userData.user.email ?? null };
}
