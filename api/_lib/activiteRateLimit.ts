// Rate limit générique pour les actions AUTHENTIFIÉES de /api/patient/activite
// (table supabase/migrations/20260928_patient_activite_rate_limit.sql).
//
// Distinct de checkRateLimit/recordLoginAttempt (api/_lib/patientAuth.ts),
// qui protègent la CONNEXION par IP, avant tout jeton. Celui-ci protège les
// actions d'un jeton déjà valide : la clé est participant_id, pas l'IP — un
// jeton compromis reste limité même utilisé depuis des IP différentes, et un
// foyer partageant une IP n'est jamais bridé à tort. Même forme que
// checkRateLimit/recordLoginAttempt (compter puis comparer), généralisée par
// `type` pour couvrir plusieurs actions avec une seule table.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SeuilRateLimit {
  max: number;
  fenetreMinutes: number;
}

// 10 requêtes / 10 min / participant / type d'action : large pour un usage
// légitime (signaler puis se rétracter plusieurs fois), serré contre un
// jeton compromis qui spammerait.
export const SEUIL_PAR_DEFAUT: SeuilRateLimit = { max: 10, fenetreMinutes: 10 };

export async function checkActiviteRateLimit(
  supabase: SupabaseClient,
  participantId: string,
  type: string,
  seuil: SeuilRateLimit = SEUIL_PAR_DEFAUT,
): Promise<boolean> {
  const since = new Date(Date.now() - seuil.fenetreMinutes * 60_000).toISOString();
  const { count } = await supabase
    .from('patient_activite_rate_limit')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', participantId)
    .eq('type', type)
    .gte('created_at', since);
  return (count ?? 0) < seuil.max;
}

export async function recordActiviteAttempt(
  supabase: SupabaseClient,
  participantId: string,
  type: string,
): Promise<void> {
  await supabase.from('patient_activite_rate_limit').insert({ participant_id: participantId, type });
}
