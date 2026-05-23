import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { NoteSeance } from '../types';

const STORAGE_KEY = 'notes_seances';
const SYNC_EVENT  = 'mouvtrack_notes_sync';

function load(): NoteSeance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function useJournalSeance() {
  const [notes, setNotes] = useState<NoteSeance[]>(load);

  // Sync between hook instances in the same tab via custom event
  useEffect(() => {
    const onSync = () => setNotes(load());
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  function ajouterNote(note: Omit<NoteSeance, 'id'>): NoteSeance {
    const nouvelle = { ...note, id: uuidv4() };
    const next = [...notes, nouvelle];
    // Write to localStorage BEFORE dispatching, so listeners read updated data
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setNotes(next);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
    return nouvelle;
  }

  function notesParPatient(participantId: string): NoteSeance[] {
    return notes
      .filter(n => n.participantId === participantId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.heureDebut.localeCompare(a.heureDebut));
  }

  function derniereNote(participantId: string): NoteSeance | null {
    return notesParPatient(participantId)[0] ?? null;
  }

  function resumeNotesPeriode(participantId: string, dateDebut: string, dateFin: string): string {
    const notesPeriode = notes.filter(n =>
      n.participantId === participantId &&
      n.date >= dateDebut &&
      n.date <= dateFin
    );
    if (notesPeriode.length === 0) return '';
    const nbDouleurs     = notesPeriode.filter(n => n.alertes.douleurSignalee).length;
    const nbProgressions = notesPeriode.filter(n => n.alertes.progressionNotable).length;
    const nbDifficiles   = notesPeriode.filter(n => n.ressenti === 'difficile').length;
    const nbExcellents   = notesPeriode.filter(n => n.ressenti === 'excellent').length;
    return `Sur ${notesPeriode.length} séances : ${nbProgressions} progressions notables, ${nbDouleurs} signalements douleur, ${nbDifficiles} séances difficiles, ${nbExcellents} séances excellentes.`;
  }

  return { notes, ajouterNote, notesParPatient, derniereNote, resumeNotesPeriode };
}
