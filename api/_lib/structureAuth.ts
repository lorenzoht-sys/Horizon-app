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
// expires_at NULL = token émis avant l'ajout de cette colonne, pas
// d'expiration rétroactive (voir 20260819_structure_token_expiration.sql).
export async function validateStructureToken(supabase: SupabaseClient, token: string): Promise<StructureInfo | null> {
  const { data, error } = await supabase
    .from('structures')
    .select('id, nom, actif, tarif_seance, praticien_id, expires_at')
    .eq('token_acces', token)
    .single();

  if (error || !data || !data.actif) return null;
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
