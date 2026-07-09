// api/_lib/patientSession.ts
//
// Émission d'un token de session patient — deux chemins d'entrée, fusionnés
// dans api/patient/session.ts (auparavant deux endpoints séparés,
// api/patient/login.ts et api/patient/praticien-acces.ts, fusionnés pour
// rester sous la limite de fonctions serverless du plan Vercel Hobby) :
//   - connexionParCode    : connexion directe par code_acces (patient)
//   - accesViaPraticien   : accès délégué par le praticien propriétaire,
//                           sans code (JWT Supabase du praticien en entrée)
//
// Extrait en _lib pour rester testable sans mock HTTP, même approche que
// api/_lib/rappels.ts / api/_lib/planningIcs.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { signPatientToken, checkRateLimit, recordLoginAttempt, logAuditEvent } from './patientAuth.js';

export interface SessionResultat {
  status: number;
  body: { token: string; participantId: string } | { error: string };
}

// Connexion patient par code d'accès (code_acces, unique, 8 caractères).
// Rate limiting : 5 tentatives / 15 min / IP (identique à l'ancien
// api/patient/login.ts).
export async function connexionParCode(supabase: SupabaseClient, code: string, ip: string): Promise<SessionResultat> {
  // Normalisation : les codes sont générés en majuscules (src/utils/codeAcces.ts).
  const codeEntre = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!codeEntre) {
    return { status: 400, body: { error: 'Code requis' } };
  }

  const allowed = await checkRateLimit(supabase, ip);
  if (!allowed) {
    await logAuditEvent(supabase, 'patient_login', null, ip, false);
    return { status: 429, body: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' } };
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
    return { status: 500, body: { error: 'Erreur serveur' } };
  }

  if (!patient) {
    await logAuditEvent(supabase, 'patient_login', null, ip, false);
    return { status: 401, body: { error: 'Ce code ne correspond à aucun compte. Contactez votre enseignant APA.' } };
  }

  await logAuditEvent(supabase, 'patient_login', patient.id, ip, true);
  const token = await signPatientToken(patient.id);
  return { status: 200, body: { token, participantId: patient.id } };
}

// Accès délégué : le praticien authentifié (JWT Supabase standard, pas de
// code) ouvre l'espace patient d'un bénéficiaire lui appartenant. Même
// format de token/durée que connexionParCode (identique à l'ancien
// api/patient/praticien-acces.ts).
export async function accesViaPraticien(
  supabase: SupabaseClient,
  praticienToken: string,
  participantId: string,
  ip: string,
): Promise<SessionResultat> {
  if (!participantId || typeof participantId !== 'string') {
    return { status: 400, body: { error: 'participantId requis' } };
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(praticienToken);
  if (userErr || !userData?.user) {
    return { status: 401, body: { error: 'Session invalide ou expirée' } };
  }

  const { data: patient, error } = await supabase
    .from('participants')
    .select('id, praticien_id')
    .eq('id', participantId)
    .maybeSingle();

  if (error) {
    return { status: 500, body: { error: 'Erreur serveur' } };
  }

  if (!patient || patient.praticien_id !== userData.user.id) {
    await logAuditEvent(supabase, 'patient_access_via_praticien', participantId, ip, false);
    return { status: 403, body: { error: 'Ce patient ne fait pas partie de votre liste.' } };
  }

  await logAuditEvent(supabase, 'patient_access_via_praticien', patient.id, ip, true);
  const token = await signPatientToken(patient.id);
  return { status: 200, body: { token, participantId: patient.id } };
}
