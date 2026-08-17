// Rate limiting pour /api/claude.ts (abus de coût sur ANTHROPIC_API_KEY,
// partagée par tous les praticiens — voir docs/RAPPORT_SECURITE.md).
// Même pattern que checkRateLimit/recordLoginAttempt dans
// api/_lib/patientAuth.ts (patient_login_attempts), table dédiée
// claude_rate_limit (supabase/migrations/20260817_securite_08_rate_limit_claude.sql).

import type { SupabaseClient } from '@supabase/supabase-js';

// 30 requêtes / heure / praticien : usage normal = quelques comptes-rendus
// générés à la demande par jour (assistant IA, interprétation de bilan),
// pas un chat conversationnel à haute fréquence. Assez large pour ne pas
// gêner une session de travail chargée, assez bas pour limiter le coût
// d'un compte compromis qui boucle sur la route.
const CLAUDE_RATE_LIMIT_MAX = 30;
const CLAUDE_RATE_LIMIT_WINDOW_MINUTES = 60;

export async function checkClaudeRateLimit(supabase: SupabaseClient, praticienId: string): Promise<boolean> {
  const since = new Date(Date.now() - CLAUDE_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabase
    .from('claude_rate_limit')
    .select('id', { count: 'exact', head: true })
    .eq('praticien_id', praticienId)
    .gte('created_at', since);
  return (count ?? 0) < CLAUDE_RATE_LIMIT_MAX;
}

export async function recordClaudeRequest(supabase: SupabaseClient, praticienId: string): Promise<void> {
  await supabase.from('claude_rate_limit').insert({ praticien_id: praticienId });
}
