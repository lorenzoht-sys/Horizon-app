import type { AccesPatient, Participant } from '../types';

const STORAGE_KEY = 'horizon_acces_patients';

const VISIBILITE_DEFAULT: AccesPatient['visibilite'] = {
  progression: true, bilans: true, rdv: true, programme: true, messagePierre: true,
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
  return load().find(a => a.participantId === participantId) ?? {
    participantId,
    visibilite: { ...VISIBILITE_DEFAULT },
  };
}

export function sauvegarderAccesPatient(acces: AccesPatient): void {
  const list = load();
  const idx = list.findIndex(a => a.participantId === acces.participantId);
  if (idx >= 0) list[idx] = acces; else list.push(acces);
  save(list);
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
