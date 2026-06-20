// POST /api/patient/exercice-libre
// Enregistre/met à jour la case "fait aujourd'hui" d'un exercice libre hors
// programme. Contrairement à la validation de séance autonome (acte engageant,
// verrouillé une fois par jour), ceci est une simple case à cocher togglable :
// upsert sur (participant_id, exercice_id, date) plutôt qu'un rejet en cas de
// doublon. N'accepte que les exercices explicitement activés par le praticien
// pour ce participant.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
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
  const { exerciceId, date, fait, note } = body;

  if (
    !exerciceId || typeof exerciceId !== 'string' ||
    (date !== undefined && typeof date !== 'string') ||
    (fait !== undefined && typeof fait !== 'boolean') ||
    (note !== undefined && note !== null && typeof note !== 'string')
  ) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const { data: activation } = await supabase
    .from('exercices_libres_activations')
    .select('actif')
    .eq('participant_id', participantId)
    .eq('exercice_id', exerciceId)
    .maybeSingle();

  if (!activation?.actif) {
    await logAuditEvent(supabase, 'patient_exercice_libre_submit', participantId, getClientIp(req), false);
    return res.status(403).json({ error: 'Cet exercice n\'est pas activé pour ce patient' });
  }

  const { error: upsertErr } = await supabase.from('exercices_libres_validations').upsert({
    participant_id: participantId,
    exercice_id: exerciceId,
    date: date ?? new Date().toISOString().split('T')[0],
    fait: fait ?? true,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
  }, { onConflict: 'participant_id,exercice_id,date' });

  if (upsertErr) {
    await logAuditEvent(supabase, 'patient_exercice_libre_submit', participantId, getClientIp(req), false);
    return res.status(500).json({ error: 'Erreur enregistrement' });
  }

  await logAuditEvent(supabase, 'patient_exercice_libre_submit', participantId, getClientIp(req), true);
  return res.status(200).json({ ok: true });
});
