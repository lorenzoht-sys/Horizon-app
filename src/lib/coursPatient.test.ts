import { describe, it, expect } from 'vitest';
import { prochainCours, historiqueCours, jourLocal, type CoursPatientRecord } from './coursPatient';

function cours(over: Partial<CoursPatientRecord> = {}): CoursPatientRecord {
  return {
    coursId: 'c1', titre: 'Gym douce', date: '2026-09-22', heureDebut: '10:00', dureeMinutes: 45,
    statut: 'planifie', presence: null, ressentiBorg: null, ressentiBienetre: null, ...over,
  };
}

describe('prochainCours', () => {
  it('le plus proche des cours planifiés à venir', () => {
    const liste = [
      cours({ coursId: 'loin', date: '2026-10-15' }),
      cours({ coursId: 'proche', date: '2026-09-23' }),
      cours({ coursId: 'milieu', date: '2026-10-01' }),
    ];
    expect(prochainCours(liste, '2026-09-21')?.coursId).toBe('proche');
  });

  it("un cours d'aujourd'hui compte comme à venir (comme « prochain rendez-vous »)", () => {
    expect(prochainCours([cours({ date: '2026-09-21' })], '2026-09-21')?.coursId).toBe('c1');
  });

  it('même jour : le plus tôt', () => {
    const liste = [cours({ coursId: 'apres', heureDebut: '15:00' }), cours({ coursId: 'avant', heureDebut: '09:00' })];
    expect(prochainCours(liste, '2026-09-22')?.coursId).toBe('avant');
  });

  it('ignore les cours annulés, réalisés, et planifiés dont la date est passée', () => {
    const liste = [
      cours({ coursId: 'annule', statut: 'annule', date: '2026-09-25' }),
      cours({ coursId: 'realise', statut: 'realise', date: '2026-09-25' }),
      cours({ coursId: 'passe', statut: 'planifie', date: '2026-09-01' }),
    ];
    expect(prochainCours(liste, '2026-09-21')).toBeNull();
  });

  it('aucun cours : null', () => {
    expect(prochainCours([], '2026-09-21')).toBeNull();
  });
});

describe('historiqueCours', () => {
  it('réalisés et annulés, du plus récent au plus ancien', () => {
    const liste = [
      cours({ coursId: 'a', statut: 'realise', date: '2026-06-01' }),
      cours({ coursId: 'b', statut: 'annule', date: '2026-06-15' }),
      cours({ coursId: 'c', statut: 'realise', date: '2026-06-08' }),
    ];
    expect(historiqueCours(liste).map(c => c.coursId)).toEqual(['b', 'c', 'a']);
  });

  it("n'y met ni un cours à venir, ni un planifié resté ouvert après sa date", () => {
    const liste = [
      cours({ coursId: 'avenir', statut: 'planifie', date: '2026-12-01' }),
      cours({ coursId: 'oublie', statut: 'planifie', date: '2026-01-01' }),
      cours({ coursId: 'fait', statut: 'realise', date: '2026-06-01' }),
    ];
    expect(historiqueCours(liste).map(c => c.coursId)).toEqual(['fait']);
  });
});

describe('jourLocal', () => {
  it('donne la date AAAA-MM-JJ du fuseau local, pas celle de l\'UTC', () => {
    // 00h30 heure locale : la date locale est bien celle de ce jour-là.
    const d = new Date(2026, 8, 22, 0, 30);
    expect(jourLocal(d)).toBe('2026-09-22');
  });
});
