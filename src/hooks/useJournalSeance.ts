import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { NoteSeance } from '../types';
import { supabase } from '../lib/supabase';
import { dbToNoteSeance, noteSeanceToDb } from '../lib/mappers';

export function useJournalSeance() {
  const [notes, setNotes] = useState<NoteSeance[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('notes_seances')
      .select('*')
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement notes séances:', error); return; }
        setNotes((data ?? []).map(dbToNoteSeance));
      });
    return () => { cancelled = true; };
  }, []);

  async function ajouterNote(note: Omit<NoteSeance, 'id'>): Promise<NoteSeance> {
    const nouvelle: NoteSeance = { ...note, id: uuidv4() };
    if (supabase) {
      const { error } = await supabase.from('notes_seances').insert(noteSeanceToDb(nouvelle));
      if (error) { console.error('Erreur ajout note séance:', error); }
    }
    setNotes(prev => [nouvelle, ...prev]);
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
