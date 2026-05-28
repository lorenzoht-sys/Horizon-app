import type { AccesPatient } from '../types';

const STORAGE_KEY = 'horizon_acces_patients';

function load(): AccesPatient[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function save(list: AccesPatient[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function trouverAccesParCode(code: string): AccesPatient | null {
  return load().find(a => a.code === code && a.actif) ?? null;
}

export function getAccesPatient(participantId: string): AccesPatient | null {
  return load().find(a => a.participantId === participantId) ?? null;
}

export function sauvegarderAccesPatient(acces: AccesPatient): void {
  const list = load();
  const idx = list.findIndex(a => a.participantId === acces.participantId);
  if (idx >= 0) list[idx] = acces; else list.push(acces);
  save(list);
}

export function revoquerAcces(participantId: string): void {
  save(load().map(a =>
    a.participantId === participantId ? { ...a, actif: false } : a
  ));
}

export function mettreAJourDernierAcces(participantId: string): void {
  save(load().map(a =>
    a.participantId === participantId
      ? { ...a, dernierAcces: new Date().toISOString() }
      : a
  ));
}

export function isExpire(dateExpiration: string): boolean {
  return new Date(dateExpiration) < new Date();
}

export function getAllAcces(): AccesPatient[] {
  return load();
}
