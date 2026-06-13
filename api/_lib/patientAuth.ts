// Fonctions partagées par les endpoints /api/patient/* (T3 — sécurisation Horizon).
// Utilisent la clé service_role (jamais exposée au client) pour accéder à
// Supabase en contournant RLS, après avoir validé le code/token côté serveur.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const SESSION_DURATION = '30d';

export function getServiceClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Configuration Supabase manquante (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getSecretKey(): Uint8Array {
  const secret = process.env.PATIENT_SESSION_SECRET;
  if (!secret) throw new Error('PATIENT_SESSION_SECRET non configuré');
  return new TextEncoder().encode(secret);
}

export async function signPatientToken(participantId: string): Promise<string> {
  return new SignJWT({ participant_id: participantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

export async function verifyPatientToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, getSecretKey());
  const participantId = payload.participant_id;
  if (typeof participantId !== 'string' || !participantId) {
    throw new Error('Token invalide');
  }
  return participantId;
}

export function extractBearerToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Identique à src/hooks/useAccesPatients.ts : code patient = prénom normalisé + "2026".
export function calculerCode(prenom: string): string {
  return prenom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    + '2026';
}

export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0];
  return req.socket?.remoteAddress ?? 'unknown';
}

// Rate limiting : 5 tentatives / 15 min / IP
// (table supabase/migrations/20260613_patient_login_rate_limit.sql).
export async function checkRateLimit(supabase: SupabaseClient, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabase
    .from('patient_login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since);
  return (count ?? 0) < RATE_LIMIT_MAX;
}

export async function recordLoginAttempt(supabase: SupabaseClient, ip: string): Promise<void> {
  await supabase.from('patient_login_attempts').insert({ ip });
}

export type AuditEventType = 'patient_login' | 'patient_data_access' | 'patient_seance_submit';

// Journal d'audit des accès à l'espace patient (connexions et accès aux
// données de santé), à des fins de conformité
// (table supabase/migrations/20260613_audit_logs.sql).
export async function logAuditEvent(
  supabase: SupabaseClient,
  eventType: AuditEventType,
  participantId: string | null,
  ip: string,
  success: boolean,
): Promise<void> {
  await supabase.from('audit_logs').insert({ event_type: eventType, participant_id: participantId, ip, success });
}
