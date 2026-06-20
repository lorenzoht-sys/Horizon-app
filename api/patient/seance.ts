// POST /api/patient/seance
// Enregistre une séance réalisée par le patient (seances_patient +
// exercices_realises). Le participant_id provient exclusivement du JWT,
// jamais du corps de la requête.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

const STATUTS_VALIDES = ['terminee', 'partielle', 'en_cours'];

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
  const { programmeId, seanceId, dateSeance, statut, commentairePatient, dureeMinutes, exercices } = body;

  if (
    !programmeId || typeof programmeId !== 'string' ||
    !seanceId || typeof seanceId !== 'string' ||
    !dateSeance || typeof dateSeance !== 'string' ||
    !STATUTS_VALIDES.includes(statut) ||
    !Array.isArray(exercices)
  ) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const { data: sp, error: spErr } = await supabase
    .from('seances_patient')
    .insert({
      participant_id: participantId,
      programme_id: programmeId,
      seance_id: seanceId,
      date_seance: dateSeance,
      statut,
      commentaire_patient: typeof commentairePatient === 'string' && commentairePatient.trim() ? commentairePatient.trim() : null,
      duree_minutes: typeof dureeMinutes === 'number' ? dureeMinutes : null,
    })
    .select()
    .single();

  if (spErr || !sp) {
    await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
    if (spErr?.code === '23505') {
      return res.status(409).json({ error: 'Vous avez déjà validé cette séance aujourd\'hui.' });
    }
    return res.status(500).json({ error: 'Erreur enregistrement séance' });
  }

  for (const ex of exercices) {
    if (!ex || typeof ex.id !== 'string') continue;
    const { error: exErr } = await supabase.from('exercices_realises').insert({
      seance_patient_id: sp.id,
      exercice_id: ex.id,
      realise: ex.realise === true,
      commentaire: typeof ex.commentaire === 'string' && ex.commentaire.trim() ? ex.commentaire.trim() : null,
    });
    if (exErr) {
      await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
      return res.status(500).json({ error: 'Erreur enregistrement exercice' });
    }
  }

  await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), true);
  return res.status(200).json({ ok: true, seancePatientId: sp.id });
});
