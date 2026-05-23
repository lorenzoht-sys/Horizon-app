import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Programme, ExerciceProgramme, SuiviJour } from '../types';
import { useParticipants } from './useParticipants';

function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function useProgramme(participantId: string) {
  const { participants, updateParticipant } = useParticipants();
  const participant = participants.find(p => p.id === participantId);
  const programmes: Programme[] = participant?.programmes ?? [];
  const programmeActif = programmes.find(p => p.actif) ?? null;

  const saveProgrammes = useCallback((next: Programme[]) => {
    updateParticipant(participantId, { programmes: next } as never);
  }, [participantId, updateParticipant]);

  const createProgramme = useCallback((data: Omit<Programme, 'id' | 'participantId' | 'dateCreation' | 'suiviSemaines' | 'actif'>) => {
    const newProg: Programme = {
      ...data,
      id: uuidv4(),
      participantId,
      dateCreation: new Date().toISOString().slice(0, 10),
      actif: true,
      suiviSemaines: [],
    };
    const updated = programmes.map(p => ({ ...p, actif: false }));
    saveProgrammes([...updated, newProg]);
    return newProg;
  }, [programmes, participantId, saveProgrammes]);

  const updateProgramme = useCallback((id: string, data: Partial<Programme>) => {
    saveProgrammes(programmes.map(p => p.id === id ? { ...p, ...data } : p));
  }, [programmes, saveProgrammes]);

  const deleteProgramme = useCallback((id: string) => {
    saveProgrammes(programmes.filter(p => p.id !== id));
  }, [programmes, saveProgrammes]);

  const addExerciceToProgramme = useCallback((programmeId: string, ep: Omit<ExerciceProgramme, 'ordre'>) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const ordre = prog.exercices.length;
    const updated = { ...prog, exercices: [...prog.exercices, { ...ep, ordre }] };
    saveProgrammes(programmes.map(p => p.id === programmeId ? updated : p));
  }, [programmes, saveProgrammes]);

  const removeExerciceFromProgramme = useCallback((programmeId: string, exerciceId: string) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const exercices = prog.exercices.filter(e => e.exerciceId !== exerciceId)
      .map((e, i) => ({ ...e, ordre: i }));
    saveProgrammes(programmes.map(p => p.id === programmeId ? { ...p, exercices } : p));
  }, [programmes, saveProgrammes]);

  const updateExerciceInProgramme = useCallback((programmeId: string, exerciceId: string, data: Partial<ExerciceProgramme>) => {
    const prog = programmes.find(p => p.id === programmeId);
    if (!prog) return;
    const exercices = prog.exercices.map(e => e.exerciceId === exerciceId ? { ...e, ...data } : e);
    saveProgrammes(programmes.map(p => p.id === programmeId ? { ...p, exercices } : p));
  }, [programmes, saveProgrammes]);

  const toggleSuivi = useCallback((programmeId: string, dateISO: string, suivi: SuiviJour) => {
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
    saveProgrammes(programmes.map(p => p.id === programmeId ? { ...p, suiviSemaines } : p));
  }, [programmes, saveProgrammes]);

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
