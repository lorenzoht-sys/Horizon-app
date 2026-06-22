// POST /api/patient/praticien-acces
// Permet au praticien propriétaire d'un patient d'ouvrir son espace patient
// sans saisir le code_acces : vérifie le JWT Supabase du praticien (session
// authenticated standard), vérifie que le patient lui appartient
// (participants.praticien_id = auth.uid()), puis renvoie un token de session
// patient (même format/durée que /api/patient/login).

import {
  getServiceClient,
  signPatientToken,
  extractBearerToken,
  getClientIp,
  logAuditEvent,
} from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const praticienToken = extractBearerToken(req);
  if (!praticienToken) return res.status(401).json({ error: 'Authentification requise' });

  const { participantId } = req.body ?? {};
  if (!participantId || typeof participantId !== 'string') {
    return res.status(400).json({ error: 'participantId requis' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(praticienToken);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  const ip = getClientIp(req);

  const { data: patient, error } = await supabase
    .from('participants')
    .select('id, praticien_id')
    .eq('id', participantId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  if (!patient || patient.praticien_id !== userData.user.id) {
    await logAuditEvent(supabase, 'patient_access_via_praticien', participantId, ip, false);
    return res.status(403).json({ error: "Ce patient ne fait pas partie de votre liste." });
  }

  await logAuditEvent(supabase, 'patient_access_via_praticien', patient.id, ip, true);

  const token = await signPatientToken(patient.id);
  return res.status(200).json({ token, participantId: patient.id });
});
