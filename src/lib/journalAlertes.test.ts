import { describe, it, expect } from 'vitest';
import { entreeAUneAlerte, type JournalEntry } from './journalAlertes';
import type { CompteRenduSeance } from '../types/seance';
import type { NoteSeance } from '../types';

function compteRendu(overrides: Partial<CompteRenduSeance> = {}): CompteRenduSeance {
  return {
    id: 'cr1',
    participantId: 'p1',
    dateSeance: '2026-07-10',
    dureeMinutes: 45,
    transcriptionBrute: '',
    exercicesRealises: [],
    observations: 'RAS',
    douleursSignalees: null,
    humeurPatient: null,
    progression: null,
    pointsAttention: null,
    prochaineSeanceNotes: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function note(overrides: Partial<NoteSeance> = {}): NoteSeance {
  return {
    id: 'n1',
    seanceId: 's1',
    participantId: 'p1',
    date: '2026-07-10',
    heureDebut: '10:00',
    ressenti: null,
    note: 'RAS',
    alertes: {
      douleurSignalee: false,
      fatiguePlusQueHabitude: false,
      progressionNotable: false,
      pointARevoir: false,
    },
    ...overrides,
  };
}

describe('entreeAUneAlerte', () => {
  it('dictée sans pointsAttention ni douleursSignalees → pas d\'alerte', () => {
    const entry: JournalEntry = { type: 'dictee', date: '2026-07-10', data: compteRendu() };
    expect(entreeAUneAlerte(entry)).toBe(false);
  });

  it('dictée avec pointsAttention non vide → alerte', () => {
    const entry: JournalEntry = { type: 'dictee', date: '2026-07-10', data: compteRendu({ pointsAttention: 'Surveiller le genou' }) };
    expect(entreeAUneAlerte(entry)).toBe(true);
  });

  it('dictée avec douleursSignalees non vide → alerte', () => {
    const entry: JournalEntry = { type: 'dictee', date: '2026-07-10', data: compteRendu({ douleursSignalees: 'Épaule droite' }) };
    expect(entreeAUneAlerte(entry)).toBe(true);
  });

  it('note manuelle sans alerte cochée → pas d\'alerte', () => {
    const entry: JournalEntry = { type: 'note', date: '2026-07-10', data: note() };
    expect(entreeAUneAlerte(entry)).toBe(false);
  });

  it('note manuelle avec une alerte cochée (douleurSignalee) → alerte', () => {
    const entry: JournalEntry = {
      type: 'note',
      date: '2026-07-10',
      data: note({ alertes: { douleurSignalee: true, fatiguePlusQueHabitude: false, progressionNotable: false, pointARevoir: false } }),
    };
    expect(entreeAUneAlerte(entry)).toBe(true);
  });

  it('note manuelle avec une autre alerte cochée (pointARevoir) → alerte', () => {
    const entry: JournalEntry = {
      type: 'note',
      date: '2026-07-10',
      data: note({ alertes: { douleurSignalee: false, fatiguePlusQueHabitude: false, progressionNotable: false, pointARevoir: true } }),
    };
    expect(entreeAUneAlerte(entry)).toBe(true);
  });
});
