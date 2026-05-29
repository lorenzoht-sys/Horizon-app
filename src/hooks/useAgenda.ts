import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { addDays, differenceInDays } from 'date-fns';
import type { Seance, StatutSeance } from '../types';
import { useParticipants } from './useParticipants';
import { supabase } from '../lib/supabase';
import { dbToSeance, seanceToDb } from '../lib/mappers';

function addMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export { addMinutes };

export function useAgenda() {
  const [seances, setSeances] = useState<Seance[]>([]);
  const { participants } = useParticipants();

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('seances')
      .select('*')
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement séances:', error); return; }
        setSeances((data ?? []).map(dbToSeance));
      });
    return () => { cancelled = true; };
  }, []);

  async function creerSeance(data: Omit<Seance, 'id'>): Promise<Seance> {
    const nouvelle: Seance = { ...data, id: uuidv4() };
    if (supabase) {
      const { error } = await supabase.from('seances').insert(seanceToDb(nouvelle));
      if (error) { console.error('Erreur création séance:', error); }
    }
    setSeances(prev => [...prev, nouvelle]);
    return nouvelle;
  }

  async function bulkCreerSeances(data: Omit<Seance, 'id'>[]): Promise<Seance[]> {
    const nouvelles: Seance[] = data.map(d => ({ ...d, id: uuidv4() }));
    if (supabase) {
      const { error } = await supabase.from('seances').insert(nouvelles.map(s => seanceToDb(s)));
      if (error) { console.error('Erreur bulk création séances:', error); }
    }
    setSeances(prev => [...prev, ...nouvelles]);
    return nouvelles;
  }

  async function modifierSeance(id: string, updates: Partial<Seance>) {
    const current = seances.find(s => s.id === id);
    if (!current) return;
    const merged = { ...current, ...updates };
    if (supabase) {
      await supabase.from('seances').update(seanceToDb(merged)).eq('id', id);
    }
    setSeances(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  async function supprimerSeance(id: string) {
    if (supabase) await supabase.from('seances').delete().eq('id', id);
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

  async function changerStatut(id: string, statut: StatutSeance) {
    await modifierSeance(id, { statut });
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
