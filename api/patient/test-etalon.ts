// POST /api/patient/test-etalon
// Enregistre le résultat d'un test étalon chronométré réalisé en autonomie.
// participant_id provient exclusivement du JWT, jamais du corps de la requête.
// N'accepte un résultat QUE si le test a été explicitement activé par le
// praticien pour ce participant (sécurité non négociable, cf. prompt
// tests-chrono) — même si l'UI patient ne devrait jamais permettre de
// soumettre un test non activé, ce contrôle serveur est la garantie réelle.

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
  const { testId, valeur, dateTest } = body;

  if (
    !testId || typeof testId !== 'string' ||
    typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur < 0 ||
    (dateTest !== undefined && typeof dateTest !== 'string')
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
});
