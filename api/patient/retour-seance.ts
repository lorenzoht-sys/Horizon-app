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
    return res.status(500).json({ error: String(err) });
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

  // ── Anti-IDOR [F-13] ──────────────────────────────────────────────────
  // `seanceId` vient du body. Cette route utilise service_role, qui contourne
  // RLS : la seule contrainte en base est la FK
  // `retours_seance.seance_id -> seances_patient(id)` (vérifiée sur le schéma
  // le 2026-09-03), qui prouve que la ligne EXISTE, jamais qu'elle appartient
  // au participant du JWT. Sans ce contrôle, un bénéficiaire authentifié
  // rattache son ressenti (Borg RPE, bien-être) à la séance d'un AUTRE
  // bénéficiaire — donnée de santé écrite dans le dossier d'un tiers.
  //
  // L'id n'est pas à deviner : `seancePatientId` est renvoyé au navigateur par
  // POST /api/patient/seance, et il reste valide indéfiniment.
  //
  // 404 et non 403 : un 403 confirmerait que l'id existe, ce qui rouvre par
  // l'autre bout l'oracle d'existence que ce contrôle ferme.
  if (seanceId) {
    const { data: seancePatient, error: seancePatientErr } = await supabase
      .from('seances_patient')
      .select('id')
      .eq('id', seanceId)
      .eq('participant_id', participantId)
      .maybeSingle();

    if (seancePatientErr || !seancePatient) {
      console.error('[retour-seance] seanceId refusé:', seanceId, 'participant:', participantId, seancePatientErr);
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
