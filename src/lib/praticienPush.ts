// Abonnement du PRATICIEN aux notifications push — écriture DIRECTE Supabase
// (RLS praticien_id = auth.uid(), voir migration
// 20260929_praticien_push_subscriptions.sql), sans route serverless : le
// praticien a déjà une session Supabase authentifiée, contrairement au
// bénéficiaire (jeton JWT maison, voir src/lib/patientApi.ts) qui doit
// passer par /api/patient/push-subscribe avec la clé service_role.
//
// Détection support/iOS/permission et abonnement navigateur (PushManager)
// restent dans src/lib/push.ts, générique, réutilisé tel quel — ce module ne
// couvre que l'enregistrement côté base.
//
// Aucun envoi de notification ici : chantier « push praticien », lot 1
// (fondations) seulement.

import type { SupabaseClient } from '@supabase/supabase-js';

export async function praticienEnregistrerAbonnementPush(
  supabase: SupabaseClient,
  praticienId: string,
  subscription: PushSubscriptionJSON,
): Promise<boolean> {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const authKey = subscription.keys?.auth;
  if (!endpoint || !p256dh || !authKey) return false;

  const { error } = await supabase.from('praticien_push_subscriptions').upsert(
    {
      praticien_id: praticienId,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
    { onConflict: 'praticien_id,endpoint' },
  );
  return !error;
}

export async function praticienSupprimerAbonnementPush(
  supabase: SupabaseClient,
  praticienId: string,
  endpoint: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('praticien_push_subscriptions')
    .delete()
    .eq('praticien_id', praticienId)
    .eq('endpoint', endpoint);
  return !error;
}
