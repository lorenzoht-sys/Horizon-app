import { describe, it, expect } from 'vitest';
import { datesCoursCollectifsIndividuelFacturables, coursCollectifsStructureFacturables } from './coursCollectifs';
import { trouverTarifApplicable, totalFactureSeance } from './tarifsContrats';
import type { CoursCollectif, ParticipationCoursCollectif, TarifContrat } from '../types';

function cours(overrides: Partial<CoursCollectif> = {}): CoursCollectif {
  return {
    id: 'cours-1',
    praticienId: 'praticien-1',
    titre: 'Gym douce',
    date: '2026-06-10',
    heureDebut: '10:00',
    dureeMinutes: 45,
    modeFacturation: 'individuel',
    statut: 'realise',
    createdAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function participation(overrides: Partial<ParticipationCoursCollectif> = {}): ParticipationCoursCollectif {
  return {
    id: 'part-1',
    coursId: 'cours-1',
    participantId: 'participant-1',
    statutPresence: 'present',
    createdAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function tarif(overrides: Partial<TarifContrat> = {}): TarifContrat {
  return {
    id: 'tarif-1',
    contratId: 'contrat-1',
    tarifSeance: 40,
    fraisDeplacement: 0,
    dateDebutValidite: '2026-01-01',
    dateFinValidite: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('facturation cours collectifs — mode individuel', () => {
  it('facture plusieurs participants présents au même cours, chacun à son propre tarif de contrat', () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10' });
    const participations = [
      participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice' }),
      participation({ id: 'p-b', coursId: 'cours-1', participantId: 'bob' }),
    ];
    const versionsAlice = [tarif({ id: 't-alice', contratId: 'contrat-alice', tarifSeance: 40 })];
    const versionsBob = [tarif({ id: 't-bob', contratId: 'contrat-bob', tarifSeance: 55, fraisDeplacement: 5 })];

    const datesAlice = datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30');
    const datesBob = datesCoursCollectifsIndividuelFacturables([c], participations, 'bob', '2026-06-01', '2026-06-30');

    expect(datesAlice).toEqual(['2026-06-10']);
    expect(datesBob).toEqual(['2026-06-10']);

    const montantAlice = datesAlice.reduce((s, d) => {
      const t = trouverTarifApplicable(versionsAlice, d);
      return s + (t ? totalFactureSeance(t) : 0);
    }, 0);
    const montantBob = datesBob.reduce((s, d) => {
      const t = trouverTarifApplicable(versionsBob, d);
      return s + (t ? totalFactureSeance(t) : 0);
    }, 0);

    expect(montantAlice).toBe(40);
    expect(montantBob).toBe(60);
  });

  it('ne facture pas un participant absent', () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10' });
    const participations = [
      participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice', statutPresence: 'absent' }),
    ];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it('ne facture pas un participant excusé', () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10' });
    const participations = [
      participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice', statutPresence: 'excuse' }),
    ];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it("ne facture rien pour un cours réalisé sans aucun participant présent (tout le monde absent/excusé)", () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10' });
    const participations = [
      participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice', statutPresence: 'absent' }),
      participation({ id: 'p-b', coursId: 'cours-1', participantId: 'bob', statutPresence: 'excuse' }),
    ];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'bob', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it('ignore un cours encore planifié (pas encore réalisé)', () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10', statut: 'planifie' });
    const participations = [participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice' })];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it('ignore un cours annulé même si des présences ont été saisies avant annulation', () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10', statut: 'annule' });
    const participations = [participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice' })];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it('ignore un cours en mode structure même si le participant est marqué présent', () => {
    const c = cours({ id: 'cours-1', date: '2026-06-10', modeFacturation: 'structure', structureId: 'structure-1' });
    const participations = [participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice' })];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it('ignore un cours hors de la période demandée', () => {
    const c = cours({ id: 'cours-1', date: '2026-07-01' });
    const participations = [participation({ id: 'p-a', coursId: 'cours-1', participantId: 'alice' })];

    expect(datesCoursCollectifsIndividuelFacturables([c], participations, 'alice', '2026-06-01', '2026-06-30')).toEqual([]);
  });
});

describe('facturation cours collectifs — mode structure', () => {
  it('compte chaque cours réalisé de la structure comme une unité, indépendamment du nombre de présents', () => {
    const coursDeStructure = [
      cours({ id: 'cours-1', date: '2026-06-05', modeFacturation: 'structure', structureId: 'structure-1' }),
      cours({ id: 'cours-2', date: '2026-06-12', modeFacturation: 'structure', structureId: 'structure-1' }),
    ];

    const facturables = coursCollectifsStructureFacturables(coursDeStructure, 'structure-1', '2026-06-01', '2026-06-30');
    expect(facturables).toHaveLength(2);

    const tarifStructure = 45;
    const montant = facturables.length * tarifStructure;
    expect(montant).toBe(90);
  });

  it("facture même un cours réalisé sans aucun participant présent (facturation à la structure, pas par bénéficiaire)", () => {
    const coursDeStructure = [cours({ id: 'cours-1', date: '2026-06-05', modeFacturation: 'structure', structureId: 'structure-1' })];
    const facturables = coursCollectifsStructureFacturables(coursDeStructure, 'structure-1', '2026-06-01', '2026-06-30');
    expect(facturables).toHaveLength(1);
  });

  it('ignore un cours encore planifié ou annulé', () => {
    const coursDeStructure = [
      cours({ id: 'cours-1', date: '2026-06-05', modeFacturation: 'structure', structureId: 'structure-1', statut: 'planifie' }),
      cours({ id: 'cours-2', date: '2026-06-12', modeFacturation: 'structure', structureId: 'structure-1', statut: 'annule' }),
    ];
    expect(coursCollectifsStructureFacturables(coursDeStructure, 'structure-1', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it("ignore un cours d'une autre structure", () => {
    const coursDeStructure = [cours({ id: 'cours-1', date: '2026-06-05', modeFacturation: 'structure', structureId: 'autre-structure' })];
    expect(coursCollectifsStructureFacturables(coursDeStructure, 'structure-1', '2026-06-01', '2026-06-30')).toEqual([]);
  });

  it('ignore un cours en mode individuel même rattaché à la structure', () => {
    const coursDeStructure = [cours({ id: 'cours-1', date: '2026-06-05', modeFacturation: 'individuel', structureId: 'structure-1' })];
    expect(coursCollectifsStructureFacturables(coursDeStructure, 'structure-1', '2026-06-01', '2026-06-30')).toEqual([]);
  });
});
