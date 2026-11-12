// Fonctions partagées par les endpoints /api/structure/* (T5 — sécurisation Horizon).
// Utilisent la clé service_role (jamais exposée au client) pour accéder à
// Supabase en contournant RLS, après avoir validé le token "x-structure-token"
// côté serveur.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StructureInfo {
  id: string;
  nom: string;
  actif: boolean;
  tarifSeance: number;
  praticienId: string;
}

export function getStructureToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const header = req.headers['x-structure-token'];
  const value = Array.isArray(header) ? header[0] : header;
  return value || null;
}

// Valide le token contre structures.token_acces. Une structure inactive
// (actif = false) ou un token expiré (expires_at dans le passé — voir
// [F-04], docs/RAPPORT_SECURITE.md) est traité comme un token invalide.
//
// expires_at NULL = token émis avant l'ajout de cette colonne : PAS
// d'expiration rétroactive. C'est une garantie, pas un effet de bord —
// couper sans préavis l'accès d'un EHPAD déjà en service serait pire que
// le risque que l'expiration corrige. Voir
// 20260819_structure_token_expiration.sql.
export async function validateStructureToken(supabase: SupabaseClient, token: string): Promise<StructureInfo | null> {
  const { data, error } = await supabase
    .from('structures')
    .select('id, nom, actif, tarif_seance, praticien_id, expires_at')
    .eq('token_acces', token)
    .single();

  if (error || !data || !data.actif) return null;
  // `data.expires_at &&` court-circuite sur NULL (falsy) : un token sans
  // expiration reste valide indéfiniment, comme avant cette colonne.
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  return {
    id: data.id,
    nom: data.nom,
    actif: data.actif,
    tarifSeance: Number(data.tarif_seance ?? 45),
    praticienId: data.praticien_id,
  };
}

// Journalisation des accès
// (table supabase/migrations/20260613_structure_access_logs.sql).
export async function logStructureAccess(supabase: SupabaseClient, structureId: string, ip: string): Promise<void> {
  await supabase.from('structure_access_logs').insert({ structure_id: structureId, ip });
}

// Limite de requêtes du portail structure (2026-11-12, point ouvert n°10 de
// docs/SECURITE.md). Le jeton de 256 bits rend la recherche exhaustive
// impraticable ; cette limite borne autre chose : l'aspiration en boucle des
// données d'une structure par quiconque détient son lien (ou un script mal
// écrit). Le portail fait UN appel par chargement de page, 60 par minute
// laissent donc une marge large à un établissement dont plusieurs postes
// rechargent en même temps.
//
// Aucune table nouvelle : structure_access_logs journalise déjà chaque accès
// réussi, il suffit de compter. Un jeton invalide ne journalise rien et n'est
// donc pas compté ; il ne renvoie de toute façon aucune donnée.
export const STRUCTURE_RATE_LIMIT_MAX = 60;
const STRUCTURE_RATE_LIMIT_WINDOW_SECONDS = 60;

// Même convention que checkClaudeRateLimit : true = la requête peut passer.
// Si le comptage échoue, la requête passe (une panne du journal ne doit pas
// fermer le portail à un EHPAD).
export async function checkStructureRateLimit(supabase: SupabaseClient, structureId: string): Promise<boolean> {
  const since = new Date(Date.now() - STRUCTURE_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const { count } = await supabase
    .from('structure_access_logs')
    .select('id', { count: 'exact', head: true })
    .eq('structure_id', structureId)
    .gte('accessed_at', since);
  return (count ?? 0) < STRUCTURE_RATE_LIMIT_MAX;
}
