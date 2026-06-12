import type { AccesPatient, Participant } from '../types';

const STORAGE_KEY = 'horizon_acces_patients';

const VISIBILITE_DEFAULT: AccesPatient['visibilite'] = {
  progression: true, bilans: true, rdv: true, programme: true, messagePierre: true, carteSante: true,
};

function load(): AccesPatient[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function save(list: AccesPatient[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function calculerCode(prenom: string): string {
  return prenom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    + '2026';
}

function loadParticipants(): Participant[] {
  try { return JSON.parse(localStorage.getItem('mouvtrack_participants') ?? '[]'); }
  catch { return []; }
}

export function trouverParticipantParCode(code: string): Participant | null {
  return loadParticipants().find(p => calculerCode(p.prenom) === code) ?? null;
}

export function getAccesPatient(participantId: string): AccesPatient {
  const found = load().find(a => a.participantId === participantId);
  if (!found) return { participantId, visibilite: { ...VISIBILITE_DEFAULT } };
  return { ...found, visibilite: { ...VISIBILITE_DEFAULT, ...found.visibilite } };
}

export function sauvegarderAccesPatient(acces: AccesPatient): void {
  const list = load();
  const idx = list.findIndex(a => a.participantId === acces.participantId);
  if (idx >= 0) list[idx] = acces; else list.push(acces);
  save(list);
}

// ── Session patient (persistance pour PWA "ajouter à l'écran d'accueil") ──────
// La PWA s'ouvre sans les paramètres d'URL (?code=...) : on garde la session
// en localStorage pour rester connecté entre deux ouvertures de l'app.

const SESSION_KEY = 'horizon_patient_session';

export interface SessionPatient {
  patientId: string;
  token: string;
}

export function sauvegarderSessionPatient(session: SessionPatient): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

export function getSessionPatient(): SessionPatient | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); }
  catch { return null; }
}

export function purgerSessionPatient(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export function mettreAJourDernierAcces(participantId: string): void {
  const list = load();
  const idx = list.findIndex(a => a.participantId === participantId);
  const now = new Date().toISOString();
  if (idx >= 0) {
    list[idx] = { ...list[idx], dernierAcces: now };
  } else {
    list.push({ participantId, visibilite: { ...VISIBILITE_DEFAULT }, dernierAcces: now });
  }
  save(list);
}
