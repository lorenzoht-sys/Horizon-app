import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { addDays, differenceInDays } from 'date-fns';
import type { Seance, StatutSeance } from '../types';
import { useParticipants } from './useParticipants';
import { DEMO_SEANCES } from '../data/demoSeances';

const STORAGE_KEY = 'mouvtrack_seances';

function load(): Seance[] {
  const cleared = !!localStorage.getItem('mouvtrack_demo_cleared');
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cleared ? [] : DEMO_SEANCES;
    const stored: Seance[] = JSON.parse(raw);
    if (cleared) return stored;
    // Fusionner les séances demo manquantes
    const ids = new Set(stored.map(s => s.id));
    const missing = DEMO_SEANCES.filter(s => !ids.has(s.id));
    return missing.length > 0 ? [...missing, ...stored] : stored;
  } catch {
    return cleared ? [] : DEMO_SEANCES;
  }
}

function addMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export { addMinutes };

export function useAgenda() {
  const [seances, setSeances] = useState<Seance[]>(load);
  const { participants } = useParticipants();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seances));
  }, [seances]);

  function creerSeance(data: Omit<Seance, 'id'>): Seance {
    const nouvelle = { ...data, id: uuidv4() };
    setSeances(prev => [...prev, nouvelle]);
    return nouvelle;
  }

  function bulkCreerSeances(data: Omit<Seance, 'id'>[]): Seance[] {
    const nouvelles: Seance[] = data.map(d => ({ ...d, id: uuidv4() }));
    setSeances(prev => [...prev, ...nouvelles]);
    return nouvelles;
  }

  function modifierSeance(id: string, updates: Partial<Seance>) {
    setSeances(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function supprimerSeance(id: string) {
    setSeances(prev => prev.filter(s => s.id !== id));
  }

  function seancesDeSemaine(dateDebut: Date): Seance[] {
    const fin = addDays(dateDebut, 6);
    return seances.filter(s => {
      const d = new Date(s.date);
      return d >= dateDebut && d <= fin;
    });
  }

  function seancesDuJour(date: string): Seance[] {
    return seances
      .filter(s => s.date === date && s.statut !== 'annulee')
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  }

  function detecterConflits(
    date: string,
    heureDebut: string,
    heureFin: string,
    excludeId?: string
  ): Seance[] {
    return seances.filter(s =>
      s.id !== excludeId &&
      s.date === date &&
      s.statut !== 'annulee' &&
      s.heureDebut < heureFin &&
      s.heureFin > heureDebut
    );
  }

  function patientsARelancer(joursMax = 21): typeof participants {
    return participants.filter(p => {
      const derniereSeance = seances
        .filter(s => s.participantId === p.id && s.statut === 'realisee')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (!derniereSeance) return true;
      return differenceInDays(new Date(), new Date(derniereSeance.date)) > joursMax;
    });
  }

  function changerStatut(id: string, statut: StatutSeance) {
    modifierSeance(id, { statut });
  }

  return {
    seances,
    creerSeance,
    bulkCreerSeances,
    modifierSeance,
    supprimerSeance,
    seancesDeSemaine,
    seancesDuJour,
    detecterConflits,
    patientsARelancer,
    changerStatut,
    addMinutes,
  };
}
