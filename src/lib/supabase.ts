import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
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
