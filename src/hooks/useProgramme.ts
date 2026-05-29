import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Programme, ExerciceProgramme, SuiviJour } from '../types';
import { supabase } from '../lib/supabase';
import { dbToProgramme, programmeToDb } from '../lib/mappers';

function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function useProgramme(participantId: string) {
  const [programmes, setProgrammes] = useState<Programme[]>([]);

  useEffect(() => {
    if (!participantId || !supabase) return;
    let cancelled = false;
    supabase
      .from('programmes')
      .select('*')
      .eq('participant_id', participantId)
      .order('date_creation', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement programmes:', error); return; }
        setProgrammes((data ?? []).map(dbToProgramme));
      });
    return () => { cancelled = true; };
  }, [participantId]);

  const programmeActif = programmes.find(p => p.actif) ?? null;

  async function upsertProgramme(prog: Programme) {
    if (supabase) {
      const { error } = await supabase.from('programmes').upsert(programmeToDb(prog));
      if (error) console.error('Erreur sauvegarde programme:', error);
    }
  }

  async function deleteProgrammeDb(id: string) {
    if (supabase) {
      const { error } = await supabase.from('programmes').delete().eq('id', id);
      if (error) console.error('Erreur suppression programme:', error);
    }
  }

  const createProgramme = useCallback(async (data: Omit<Programme, 'id' | 'participantId' | 'dateCreation' | 'suiviSemaines' | 'actif'>) => {
    const newProg: Programme = {
      ...data,
      id: uuidv4(),
      participantId,
      dateCreation: new Date().toISOString().slice(0, 10),
      actif: true,
      suiviSemaines: [],
    };
    if (supabase) {
      await supabase.from('programmes').update({ actif: false }).eq('participant_id', participantId);
      const { error } = await supabase.from('programmes').upsert(programmeToDb(newProg));
      if (error) console.error('Erreur création programme:', error);
    }
    setProgrammes(prev => [...prev.map(p => ({ ...p, actif: false })), newProg]);
    return newProg;
  }, [programmes, participantId]);

  const updateProgramme = useCallback(async (id: string, data: Partial<Programme>) => {
    const current = programmes.find(p => p.id === id);
    if (!current) return;
    const merged = { ...current, ...data };
    await upsertProgramme(merged);
    setProgrammes(prev => prev.map(p => p.id === id ? merged : p));
  }, [programmes]);

  const deleteProgramme = useCallback(async (id: string) => {
    await deleteProgrammeDb(id);
    setProgrammes(prev => prev.filter(p => p.id !== id));
  }, []);

  const addExerciceToProgramme = useCallback(async (programmeId: string, ep: Omit<ExerciceProgramme, 'ordre'>) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const ordre = prog.exercices.length;
    const updated = { ...prog, exercices: [...prog.exercices, { ...ep, ordre }] };
    await upsertProgramme(updated);
    setProgrammes(prev => prev.map(p => p.id === programmeId ? updated : p));
  }, [programmes]);

  const removeExerciceFromProgramme = useCallback(async (programmeId: string, exerciceId: string) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const exercices = prog.exercices.filter(e => e.exerciceId !== exerciceId)
      .map((e, i) => ({ ...e, ordre: i }));
    const updated = { ...prog, exercices };
    await upsertProgramme(updated);
    setProgrammes(prev => prev.map(p => p.id === programmeId ? updated : p));
  }, [programmes]);

  const updateExerciceInProgramme = useCallback(async (programmeId: string, exerciceId: string, data: Partial<ExerciceProgramme>) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const exercices = prog.exercices.map(e => e.exerciceId === exerciceId ? { ...e, ...data } : e);
    const updated = { ...prog, exercices };
    await upsertProgramme(updated);
    setProgrammes(prev => prev.map(p => p.id === programmeId ? updated : p));
  }, [programmes]);

  const toggleSuivi = useCallback(async (programmeId: string, dateISO: string, suivi: SuiviJour) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const semaine = getMondayISO(new Date(dateISO));
    const suiviSemaines = [...prog.suiviSemaines];
    let sIdx = suiviSemaines.findIndex(s => s.semaine === semaine);
    if (sIdx === -1) {
      suiviSemaines.push({ semaine, jours: {} });
      sIdx = suiviSemaines.length - 1;
    }
    const jours = { ...suiviSemaines[sIdx].jours };
    const existing = jours[dateISO] ?? [];
    const idx = existing.findIndex(e => e.exerciceId === suivi.exerciceId);
    if (idx === -1) {
      jours[dateISO] = [...existing, suivi];
    } else {
      jours[dateISO] = existing.map((e, i) => i === idx ? { ...e, ...suivi } : e);
    }
    suiviSemaines[sIdx] = { ...suiviSemaines[sIdx], jours };
    const updated = { ...prog, suiviSemaines };
    await upsertProgramme(updated);
    setProgrammes(prev => prev.map(p => p.id === programmeId ? updated : p));
  }, [programmes]);

  function calcAdherence(prog: Programme): { taux: number; fait: number; prevu: number } {
    if (prog.suiviSemaines.length === 0) return { taux: 0, fait: 0, prevu: 0 };
    let totalFait = 0;
    let totalPrevu = 0;
    for (const semaine of prog.suiviSemaines) {
      for (const jours of Object.values(semaine.jours)) {
        totalFait += jours.filter(j => j.fait).length;
        totalPrevu += jours.length;
      }
    }
    return {
      taux: totalPrevu > 0 ? Math.round((totalFait / totalPrevu) * 100) : 0,
      fait: totalFait,
      prevu: totalPrevu,
    };
  }

  function getAdherenceParSemaine(prog: Programme) {
    return prog.suiviSemaines.map(s => {
      let fait = 0;
      let prevu = 0;
      for (const jours of Object.values(s.jours)) {
        fait += jours.filter(j => j.fait).length;
        prevu += jours.length;
      }
      return {
        semaine: s.semaine,
        taux: prevu > 0 ? Math.round((fait / prevu) * 100) : 0,
        fait,
        prevu,
      };
    });
  }

  function getExercicesAujourdHui(prog: Programme): string[] {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    return prog.exercices
      .filter(e => e.frequenceParSemaine.includes(dayOfWeek))
      .sort((a, b) => a.ordre - b.ordre)
      .map(e => e.exerciceId);
  }

  return {
    programmes,
    programmeActif,
    createProgramme,
    updateProgramme,
    deleteProgramme,
    addExerciceToProgramme,
    removeExerciceFromProgramme,
    updateExerciceInProgramme,
    toggleSuivi,
    calcAdherence,
    getAdherenceParSemaine,
    getExercicesAujourdHui,
  };
}
