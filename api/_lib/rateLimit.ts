// Rate limiting pour /api/claude.ts (abus de coût sur ANTHROPIC_API_KEY,
// partagée par tous les praticiens — voir docs/RAPPORT_SECURITE.md).
// Même pattern que checkRateLimit/recordLoginAttempt dans
// api/_lib/patientAuth.ts (patient_login_attempts), table dédiée
// claude_rate_limit (supabase/migrations/20260817_securite_08_rate_limit_claude.sql).

import type { SupabaseClient } from '@supabase/supabase-js';

// 100 requêtes / heure / praticien. [F-12, docs/RAPPORT_SECURITE.md]
// La branche d'audit avait initialement fixé 30, puis révisé à 60 le
// 2026-08-19 (AssistantPage.tsx est un chat multi-tours, une génération de
// programme coûte déjà 2 appels, une session chargée sur 6-8 patients peut
// atteindre 24-40 appels). Repassé à 100 le 2026-08-26 : aucune mesure
// réelle de l'usage de Pierre n'est disponible pour trancher entre 60 et
// une valeur plus prudente, et l'asymétrie du risque penche nettement d'un
// côté — un praticien bloqué en pleine consultation coûte bien plus qu'un
// abuseur qui va jusqu'à 100 appels au lieu de 60 avant d'être stoppé. 100
// arrête tout aussi net un script automatisé qui boucle. Le log au moment
// du blocage (voir api/claude.ts) permettra d'ajuster ce chiffre sur des
// données réelles plutôt que sur cette estimation.
const CLAUDE_RATE_LIMIT_MAX = 100;
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
