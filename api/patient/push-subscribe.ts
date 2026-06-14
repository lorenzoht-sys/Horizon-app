// POST   /api/patient/push-subscribe — enregistre un abonnement push pour le
//        patient authentifié (rappels-patients, T2).
// DELETE /api/patient/push-subscribe — supprime un abonnement (désactivation
//        des rappels sur cet appareil).
//
// Le patient ne peut écrire que ses propres abonnements (participant_id issu
// du JWT, jamais fourni par le client) — clé service_role utilisée pour
// contourner RLS (les abonnements ne sont pas accessibles en écriture aux
// utilisateurs authentifiés Supabase, voir 20260615_rappels_patients.sql).

import { getServiceClient, verifyPatientToken, extractBearerToken } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  let participantId: string;
  try {
    participantId = await verifyPatientToken(token);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  if (req.method === 'POST') {
    const { subscription } = req.body ?? {};
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof authKey !== 'string') {
      return res.status(400).json({ error: 'Abonnement invalide' });
    }

    const userAgent = req.headers['user-agent'] ?? null;
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        participant_id: participantId,
        endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: typeof userAgent === 'string' ? userAgent : null,
      },
      { onConflict: 'participant_id,endpoint' },
    );

    if (error) return res.status(500).json({ error: 'Erreur serveur' });
    return res.status(200).json({ ok: true });
  }

  // DELETE
  const { endpoint } = req.body ?? {};
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ error: 'endpoint requis' });
  }
  await supabase.from('push_subscriptions').delete().eq('participant_id', participantId).eq('endpoint', endpoint);
  return res.status(200).json({ ok: true });
});
