// POST /api/patient/activite
// Enregistre une activité autonome du patient. Le champ `type` discrimine :
//   'test-etalon'    → résultat chronométré (insert non modifiable)
//   'exercice-libre' → case togglable (upsert sur participant+exercice+date)
//
// Fusionne les anciens /api/patient/test-etalon et /api/patient/exercice-libre.
// participant_id provient exclusivement du JWT, jamais du body.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  let participantId: string;
  try {
    participantId = await verifyPatientToken(token);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  const body = req.body ?? {};
  const { type } = body;

  if (type !== 'test-etalon' && type !== 'exercice-libre') {
    return res.status(400).json({ error: 'type requis : "test-etalon" ou "exercice-libre"' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[api/patient/activite] getServiceClient:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // ── test-etalon ───────────────────────────────────────────────────────────
  if (type === 'test-etalon') {
    const { testId, valeur, dateTest } = body;

    if (
      !testId || typeof testId !== 'string' ||
      typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur < 0 ||
      (dateTest !== undefined && typeof dateTest !== 'string')
    ) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }

    const { data: activation } = await supabase
      .from('tests_etalons_activations')
      .select('actif')
      .eq('participant_id', participantId)
      .eq('test_id', testId)
      .maybeSingle();

    if (!activation?.actif) {
      await logAuditEvent(supabase, 'patient_test_etalon_submit', participantId, getClientIp(req), false);
      return res.status(403).json({ error: 'Ce test n\'est pas activé pour ce patient' });
    }

    const { error: insErr } = await supabase.from('tests_etalons_resultats').insert({
      participant_id: participantId,
      test_id: testId,
      valeur,
      date_test: dateTest ?? new Date().toISOString().split('T')[0],
    });

    if (insErr) {
      await logAuditEvent(supabase, 'patient_test_etalon_submit', participantId, getClientIp(req), false);
      return res.status(500).json({ error: 'Erreur enregistrement du résultat' });
    }

    await logAuditEvent(supabase, 'patient_test_etalon_submit', participantId, getClientIp(req), true);
    return res.status(200).json({ ok: true });
  }

  // ── exercice-libre ────────────────────────────────────────────────────────
  const { exerciceId, date, fait, note } = body;

  if (
    !exerciceId || typeof exerciceId !== 'string' ||
    (date !== undefined && typeof date !== 'string') ||
    (fait !== undefined && typeof fait !== 'boolean') ||
    (note !== undefined && note !== null && typeof note !== 'string')
  ) {
    return res.status(400).json({ error: 'Paramètres invalides' });
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
