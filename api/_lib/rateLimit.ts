// Rate limiting pour /api/claude.ts (abus de coût sur ANTHROPIC_API_KEY,
// partagée par tous les praticiens — voir docs/RAPPORT_SECURITE.md).
// Même pattern que checkRateLimit/recordLoginAttempt dans
// api/_lib/patientAuth.ts (patient_login_attempts), table dédiée
// claude_rate_limit (supabase/migrations/20260817_securite_08_rate_limit_claude.sql).

import type { SupabaseClient } from '@supabase/supabase-js';

// 60 requêtes / heure / praticien. [F-12, docs/RAPPORT_SECURITE.md,
// 2026-08-19] Révisé depuis 30 : AssistantPage.tsx est un chat multi-tours
// (pas "pas un chat conversationnel à haute fréquence" comme le disait ce
// commentaire avant révision), et une seule génération de programme coûte
// déjà 2 appels (genererQuestionsClarification + genererProgrammeStructure,
// src/utils/genererProgrammeIA.ts). Une session chargée sur 6-8 patients
// (interprétation + programme + quelques échanges de chat chacun) peut
// atteindre 24-40 appels — 30 était trop juste pour un usage légitime. 60
// reste borné (un compte compromis ne peut pas boucler indéfiniment) tout
// en absorbant une session multi-patients normale.
const CLAUDE_RATE_LIMIT_MAX = 60;
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
