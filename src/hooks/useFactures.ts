import { useState } from 'react';
import type { Facture } from '../types';

const STORAGE_KEY = 'mouvtrack_factures';

function load(): Facture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(factures: Facture[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(factures)); } catch { /* ignore */ }
}

export function useFactures() {
  const [factures, setFactures] = useState<Facture[]>(load);

  function ajouterFactures(nouvelles: Facture[]) {
    const prev = load();
    const ids = new Set(nouvelles.map(f => f.id));
    const filtered = prev.filter(f => !ids.has(f.id));
    const next = [...nouvelles, ...filtered].sort((a, b) =>
      b.dateEmission.localeCompare(a.dateEmission)
    );
    save(next);       // synchrone — avant tout changement d'onglet
    setFactures(next);
  }

  function marquerEmise(id: string) {
    const next = load().map(f => f.id === id ? { ...f, statut: 'emise' as const } : f);
    save(next);
    setFactures(next);
  }

  function marquerPayee(id: string) {
    const next = load().map(f =>
      f.id === id
        ? { ...f, statut: 'payee' as const, datePaiement: new Date().toISOString().split('T')[0] }
        : f
    );
    save(next);
    setFactures(next);
  }

  function supprimerFacture(id: string) {
    const next = load().filter(f => f.id !== id);
    save(next);
    setFactures(next);
  }

  return { factures, ajouterFactures, marquerEmise, marquerPayee, supprimerFacture };
}
