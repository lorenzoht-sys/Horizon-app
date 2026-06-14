// POST /api/patient/login
// Valide le code d'accès patient (code_acces, unique, fix-code-acces) côté
// serveur via service_role, et renvoie un JWT signé (PATIENT_SESSION_SECRET,
// 30 jours).
// Rate limiting : 5 tentatives / 15 min / IP
// (supabase/migrations/20260613_patient_login_rate_limit.sql).

import {
  getServiceClient,
  signPatientToken,
  getClientIp,
  checkRateLimit,
  recordLoginAttempt,
  logAuditEvent,
} from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body ?? {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code requis' });
  }

  // Normalisation : les codes sont générés en majuscules (src/utils/codeAcces.ts).
  // Un code vide après trim ne peut jamais correspondre à un code_acces (qui
  // fait toujours 8 caractères) : on rejette tout de suite.
  const codeEntre = code.trim().toUpperCase();
  if (!codeEntre) {
    return res.status(400).json({ error: 'Code requis' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const ip = getClientIp(req);

  const allowed = await checkRateLimit(supabase, ip);
  if (!allowed) {
    await logAuditEvent(supabase, 'patient_login', null, ip, false);
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }
  await recordLoginAttempt(supabase, ip);

  // NULL = '<code>' est toujours faux en SQL : un participant sans
  // code_acces (pas encore backfillé) ne peut jamais matcher.
  const { data: patient, error } = await supabase
    .from('participants')
    .select('id')
    .eq('code_acces', codeEntre)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  if (!patient) {
    await logAuditEvent(supabase, 'patient_login', null, ip, false);
    return res.status(401).json({ error: 'Ce code ne correspond à aucun compte. Contactez votre enseignant APA.' });
  }

  await logAuditEvent(supabase, 'patient_login', patient.id, ip, true);

  const token = await signPatientToken(patient.id);
  return res.status(200).json({ token, participantId: patient.id });
});
