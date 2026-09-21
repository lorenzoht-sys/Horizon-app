import { describe, it, expect } from 'vitest';
import {
  datesCoursCollectifsIndividuelFacturables, coursCollectifsStructureFacturables,
  etatCours, presenceConstatee, entreesCoursDuParticipant,
} from './coursCollectifs';
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

describe('lecture côté fiche : état du cours', () => {
  it('un cours annulé ou réalisé garde son statut, quelle que soit la date', () => {
    expect(etatCours(cours({ statut: 'annule', date: '2099-01-01' }), '2026-09-21')).toBe('annule');
    expect(etatCours(cours({ statut: 'realise', date: '2099-01-01' }), '2026-09-21')).toBe('realise');
  });

  it("planifié : à venir aujourd'hui et après, à clôturer une fois la date passée", () => {
    const c = (date: string) => cours({ statut: 'planifie', date });
    expect(etatCours(c('2026-09-22'), '2026-09-21')).toBe('a_venir');
    expect(etatCours(c('2026-09-21'), '2026-09-21')).toBe('a_venir');
    expect(etatCours(c('2026-09-20'), '2026-09-21')).toBe('a_cloturer');
  });
});

describe('lecture côté fiche : présence constatée', () => {
  // statut_presence vaut « present » PAR DÉFAUT dès l'inscription : ce « présent »
  // n'est constaté par personne tant que le cours n'est pas réalisé.
  it('cours réalisé : la présence saisie par le praticien', () => {
    expect(presenceConstatee({ cours: cours({ statut: 'realise' }), participation: participation({ statutPresence: 'absent' }) })).toBe('absent');
    expect(presenceConstatee({ cours: cours({ statut: 'realise' }), participation: participation({ statutPresence: 'present' }) })).toBe('present');
  });

  it('cours planifié ou annulé : aucune présence, même si la base dit « present » par défaut', () => {
    for (const statut of ['planifie', 'annule'] as const) {
      expect(presenceConstatee({ cours: cours({ statut }), participation: participation({ statutPresence: 'present' }) }), statut).toBeNull();
    }
  });
});

describe("lecture côté fiche : cours d'un bénéficiaire", () => {
  const c1 = cours({ id: 'c1', date: '2026-06-10', heureDebut: '10:00' });
  const c2 = cours({ id: 'c2', date: '2026-06-17', heureDebut: '09:00' });
  const c3 = cours({ id: 'c3', date: '2026-06-17', heureDebut: '14:00' });

  it('ne garde que ce bénéficiaire, du plus récent au plus ancien (date puis heure)', () => {
    const parts = [
      participation({ id: 'p1', coursId: 'c1', participantId: 'u1' }),
      participation({ id: 'p2', coursId: 'c2', participantId: 'u1' }),
      participation({ id: 'p3', coursId: 'c3', participantId: 'u1' }),
      participation({ id: 'p4', coursId: 'c1', participantId: 'autre' }),
    ];
    expect(entreesCoursDuParticipant([c1, c2, c3], parts, 'u1').map(e => e.cours.id)).toEqual(['c3', 'c2', 'c1']);
    expect(entreesCoursDuParticipant([c1, c2, c3], parts, 'autre').map(e => e.cours.id)).toEqual(['c1']);
  });

  it("ignore une participation dont le cours n'est pas visible (RLS) au lieu de planter", () => {
    const parts = [participation({ id: 'p1', coursId: 'introuvable', participantId: 'u1' })];
    expect(entreesCoursDuParticipant([c1], parts, 'u1')).toEqual([]);
  });

  it('aucun cours : liste vide', () => {
    expect(entreesCoursDuParticipant([], [], 'u1')).toEqual([]);
  });
});
