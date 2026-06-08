import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export const isSupabaseConfigured = Boolean(supabase);

// Client dédié au portail structure (accès anonyme par lien/token).
// Le token est transmis dans l'en-tête "x-structure-token" et vérifié
// côté base par les policies RLS (cf. migration 20260608_fix_structure_anon_rls.sql) :
// sans cet en-tête, aucune donnée patient n'est lisible.
export function createStructurePortailClient(token: string) {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { 'x-structure-token': token } },
  });
}
