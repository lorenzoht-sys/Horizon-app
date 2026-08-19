// POST /api/patient/retour-seance
// Enregistre un retour post-séance autonome (Borg RPE + bien-être subjectif).
// participant_id et praticien_id proviennent du JWT + BD, jamais du body.

import {
  getServiceClient, verifyPatientToken, extractBearerToken,
  getClientIp, logAuditEvent,
} from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
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

  const body = req.body ?? {};
  const { seanceId, borgRpe, bienEtre } = body;

  if (
    typeof borgRpe !== 'number' || !Number.isInteger(borgRpe) || borgRpe < 1 || borgRpe > 10 ||
    typeof bienEtre !== 'number' || !Number.isInteger(bienEtre) || bienEtre < 1 || bienEtre > 5
  ) {
    return res.status(400).json({ error: 'Paramètres invalides (borgRpe 1-10, bienEtre 1-5)' });
  }
  if (seanceId !== undefined && seanceId !== null && typeof seanceId !== 'string') {
    return res.status(400).json({ error: 'seanceId invalide' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[api/patient/retour-seance] getServiceClient:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // Récupérer praticien_id depuis participants — jamais depuis le body
  const { data: participant, error: pErr } = await supabase
    .from('participants')
    .select('praticien_id')
    .eq('id', participantId)
    .single();

  if (pErr || !participant) {
    console.error('[retour-seance] participant introuvable:', participantId, pErr);
    await logAuditEvent(supabase, 'patient_retour_submit', participantId, getClientIp(req), false);
    return res.status(404).json({ error: 'Participant introuvable' });
  }

  // praticien_id peut être NULL (référent parti, mode organisation — voir
  // palier 2 de CONCEPTION_MODE_ORGANISATION.md) : retours_seance.praticien_id
  // est nullable depuis la migration FK SET NULL, ce n'est plus une condition
  // de rejet.

  // Anti-IDOR [F-13, docs/RAPPORT_SECURITE.md] : seanceId vient du body — sans
  // ce contrôle, rien n'empêche un patient authentifié de soumettre le
  // seanceId d'un AUTRE participant (service_role contourne RLS). Même
  // schéma que api/patient/seance.ts:54-63 (programmeId/seanceId) :
  // retours_seance.seance_id référence seances_patient(id) — vérifier que
  // cette ligne appartient bien au participant du JWT avant insert.
  if (seanceId) {
    const { data: seancePatient, error: seancePatientErr } = await supabase
      .from('seances_patient')
      .select('id')
      .eq('id', seanceId)
      .eq('participant_id', participantId)
      .maybeSingle();
    if (seancePatientErr || !seancePatient) {
      await logAuditEvent(supabase, 'patient_retour_submit', participantId, getClientIp(req), false);
      return res.status(404).json({ error: 'Séance introuvable' });
    }
  }

  const { error: insErr } = await supabase.from('retours_seance').insert({
    participant_id: participantId,
    praticien_id: participant.praticien_id,
    seance_id: seanceId ?? null,
    date: new Date().toISOString().split('T')[0],
    borg_rpe: borgRpe,
    bien_etre: bienEtre,
  });

  if (insErr) {
    console.error('[retour-seance] échec insertion retours_seance:', insErr.code, insErr.message, insErr.details, insErr.hint);
    await logAuditEvent(supabase, 'patient_retour_submit', participantId, getClientIp(req), false);
    const detail = process.env.VERCEL_ENV !== 'production' ? ` (${insErr.code}: ${insErr.message})` : '';
    return res.status(500).json({ error: `Erreur enregistrement retour${detail}` });
  }

  await logAuditEvent(supabase, 'patient_retour_submit', participantId, getClientIp(req), true);
  return res.status(200).json({ ok: true });
});
