import { describe, it, expect } from 'vitest';
import { entreeAUneAlerte, cleEntree, type JournalEntry } from './journalAlertes';
import type { CompteRenduSeance } from '../types/seance';
import type { NoteSeance, CoursCollectif, ParticipationCoursCollectif } from '../types';

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

describe('entrées « cours collectif » du journal', () => {
  const cours: CoursCollectif = {
    id: 'c1', praticienId: 'pr1', titre: 'Gym douce', date: '2026-07-10', heureDebut: '10:00',
    dureeMinutes: 45, modeFacturation: 'individuel', statut: 'realise', createdAt: '',
  };
  const participation: ParticipationCoursCollectif = {
    id: 'pc1', coursId: 'c1', participantId: 'p1', statutPresence: 'present',
    notes: 'Douleur épaule droite', createdAt: '',
  };
  const entry: JournalEntry = { type: 'cours', date: cours.date, data: { cours, participation } };

  it("pas de point d'alerte : une note libre ne se devine pas « à surveiller »", () => {
    expect(entreeAUneAlerte(entry)).toBe(false);
  });

  it("a une clé propre, distincte de celle d'un compte rendu ou d'une note (même identifiant possible)", () => {
    expect(cleEntree(entry)).toBe('cours-pc1');
    const dictee: JournalEntry = { type: 'dictee', date: '2026-07-10', data: compteRendu({ id: 'pc1' }) };
    expect(cleEntree(dictee)).toBe('pc1');
    expect(cleEntree(entry)).not.toBe(cleEntree(dictee));
  });
});
