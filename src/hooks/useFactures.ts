import { useState, useEffect } from 'react';
import type { Facture } from '../types';

const STORAGE_KEY = 'mouvtrack_factures';

function load(): Facture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function useFactures() {
  const [factures, setFactures] = useState<Facture[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(factures));
  }, [factures]);

  function ajouterFactures(nouvelles: Facture[]) {
    setFactures(prev => {
      const ids = new Set(nouvelles.map(f => f.id));
      const filtered = prev.filter(f => !ids.has(f.id));
      return [...nouvelles, ...filtered].sort((a, b) =>
        b.dateEmission.localeCompare(a.dateEmission)
      );
    });
  }

  function marquerEmise(id: string) {
    setFactures(prev =>
      prev.map(f => f.id === id ? { ...f, statut: 'emise' as const } : f)
    );
  }

  function marquerPayee(id: string) {
    setFactures(prev =>
      prev.map(f =>
        f.id === id
          ? { ...f, statut: 'payee' as const, datePaiement: new Date().toISOString().split('T')[0] }
          : f
      )
    );
  }

  function supprimerFacture(id: string) {
    setFactures(prev => prev.filter(f => f.id !== id));
  }

  return { factures, ajouterFactures, marquerEmise, marquerPayee, supprimerFacture };
}
