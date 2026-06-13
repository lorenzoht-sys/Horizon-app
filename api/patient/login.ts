// POST /api/patient/login
// Valide le code patient (prénom normalisé + "2026") côté serveur via
// service_role, et renvoie un JWT signé (PATIENT_SESSION_SECRET, 30 jours).
// Rate limiting : 5 tentatives / 15 min / IP
// (supabase/migrations/20260613_patient_login_rate_limit.sql).

import {
  getServiceClient,
  signPatientToken,
  calculerCode,
  getClientIp,
  checkRateLimit,
  recordLoginAttempt,
} from '../_lib/patientAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body ?? {};
  if (!code || typeof code !== 'string') {
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
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }
  await recordLoginAttempt(supabase, ip);

  const { data: participants, error } = await supabase
    .from('participants')
    .select('id, prenom');

  if (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  const codeEntre = code.trim().toLowerCase();
  const patient = (participants ?? []).find(p => calculerCode(p.prenom) === codeEntre);

  if (!patient) {
    return res.status(401).json({ error: 'Ce code ne correspond à aucun compte. Contactez votre enseignant APA.' });
  }

  const token = await signPatientToken(patient.id);
  return res.status(200).json({ token, participantId: patient.id });
}
