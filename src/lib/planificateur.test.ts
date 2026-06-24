import { describe, it, expect } from 'vitest';
import type { Participant, Contrat, Seance, IndisponibilitePierre } from '../types';
import {
  planifierSemaine,
  planifierRecurrent,
  coordKey,
  prochainLundi,
  type MatriceORS,
  type PlanificateurParams,
} from './planificateur';

// ── Fixtures minimales ────────────────────────────────────────────────────────

const DEPART = { lat: 0, lng: 0 };

function makePatient(overrides: Partial<Participant> & { id: string; lat?: number; lng?: number; jours?: string[] }): Participant {
  const { lat = 1, lng = 1, jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'], ...rest } = overrides;
  return {
    nom: 'Patiente', prenom: 'Test',
    dateNaissance: '1950-01-01', dateCreation: '2026-01-01',
    token: 'tok', bilans: [],
    coordonnees: { lat, lng, geocodeeAt: '2026-01-01' },
    anamnese: { organisation: { joursDisponibles: jours } },
    ...rest,
  };
}

function makeContrat(overrides: Partial<Contrat> & { id: string; participantId: string }): Contrat {
  return {
    dateDebut: '2026-01-01',
    dateFin: '2026-12-31',
    nbSeancesSemaine: 1,
    heureDebut: '08:00',
    dureeMinutes: 45,
    dureesSeances: [45],
    statut: 'actif',
    dateCreation: '2026-01-01',
    nombreSeancesTotal: 10,
    nombreSeancesRealisees: 0,
    ...overrides,
  };
}

function makeSeance(overrides: Partial<Seance> & { id: string; participantId: string; date: string }): Seance {
  return {
    contratId: undefined,
    heureDebut: '08:00',
    heureFin: '08:45',
    dureeMinutes: 45,
    type: 'seance',
    statut: 'planifiee',
    adresse: '',
    ...overrides,
  };
}

// Matrice de trajets factice mais déterministe : le coût ne dépend que des
// index des points (point 0 = départ), suffisant pour des tests sur la
// logique d'assignation (pas sur la précision géographique).
function buildMatrix(points: { lat: number; lng: number }[]): { matrix: MatriceORS; indexMap: Map<string, number> } {
  const n = points.length;
  const durees: number[][] = [];
  const distances: number[][] = [];
  for (let i = 0; i < n; i++) {
    durees[i] = [];
    distances[i] = [];
    for (let j = 0; j < n; j++) {
      const sec = Math.abs(i - j) * 600;
      durees[i][j] = sec;
      distances[i][j] = sec * 10;
    }
  }
  const indexMap = new Map(points.map((p, i) => [coordKey(p), i]));
  return { matrix: { durees, distances, fallback: false }, indexMap };
}

function makeParams(opts: {
  participants: Participant[];
  contrats: Contrat[];
  seances?: Seance[];
  indispos?: IndisponibilitePierre[];
  depart?: { lat: number; lng: number };
}): PlanificateurParams {
  const depart = opts.depart ?? DEPART;
  const points = [depart, ...opts.participants.map(p => p.coordonnees!)];
  const { matrix, indexMap } = buildMatrix(points);
  return {
    participants: opts.participants,
    contrats: opts.contrats,
    seances: opts.seances ?? [],
    indispos: opts.indispos ?? [],
    depart,
    matrix,
    indexMap,
    heureDebutJournee: '08:00',
  };
}

const LUNDI = prochainLundi('2026-06-24'); // mercredi -> prochain lundi réel

function toutesLesEtapes(jours: ReturnType<typeof planifierSemaine>['jours']) {
  return jours.flatMap(j => j.etapes);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('planifierSemaine — jamais 2 séances le même jour pour un patient', () => {
  it('un patient avec 2 contrats actifs ne reçoit jamais 2 séances la même date', () => {
    const patient = makePatient({ id: 'p1' });
    const contratA = makeContrat({ id: 'cA', participantId: 'p1' });
    const contratB = makeContrat({ id: 'cB', participantId: 'p1' });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contratA, contratB] }), LUNDI);

    const dates = toutesLesEtapes(r.jours).map(e => e.date);
    expect(new Set(dates).size).toBe(dates.length); // aucune date dupliquée
    expect(dates.length).toBe(2); // les 2 contrats ont bien obtenu une séance chacun
  });

  it('si le patient est déjà pris tous les jours dispo par un 1er contrat, le 2e contrat part en "à planifier manuellement"', () => {
    const patient = makePatient({ id: 'p1', jours: ['Lun'] }); // 1 seul jour dispo
    const contratA = makeContrat({ id: 'cA', participantId: 'p1', nbSeancesSemaine: 1 });
    const contratB = makeContrat({ id: 'cB', participantId: 'p1', nbSeancesSemaine: 1 });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contratA, contratB] }), LUNDI);

    const dates = toutesLesEtapes(r.jours).map(e => e.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.length).toBe(1); // un seul des deux contrats a pu être placé
    expect(r.impossibles.some(i => i.patient.id === 'p1' && /autre contrat actif/.test(i.raison))).toBe(true);
  });
});

describe('planifierSemaine — fréquence de contrat invalide', () => {
  it('nbSeancesSemaine = 0 part en "à planifier manuellement", jamais ignoré silencieusement', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 0 });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles).toHaveLength(1);
    expect(r.impossibles[0].patient.id).toBe('p1');
    expect(r.impossibles[0].raison).toMatch(/Fréquence invalide/);
  });

  it('nbSeancesSemaine négatif part en "à planifier manuellement" (et ne produit pas un nombre de jours fantaisiste)', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: -2 });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles[0].raison).toMatch(/Fréquence invalide/);
  });
});

describe('planifierSemaine — patient sans disponibilités', () => {
  it('aucun jour disponible renseigné → "à planifier manuellement", pas de crash', () => {
    const patient = makePatient({ id: 'p1', jours: [] });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 2 });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles).toHaveLength(1);
    expect(r.impossibles[0].patient.id).toBe('p1');
    expect(r.impossibles[0].raison).toMatch(/Disponibilités du patient non renseignées/);
  });

  it('anamnese absente (organisation jamais saisie) → "à planifier manuellement", pas de crash', () => {
    const patient = makePatient({ id: 'p1' });
    patient.anamnese = undefined;
    const contrat = makeContrat({ id: 'c1', participantId: 'p1' });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles[0].raison).toMatch(/Disponibilités du patient non renseignées/);
  });
});

describe('planifierSemaine / planifierRecurrent — point de départ manquant', () => {
  it('depart non numérique (adresse non configurée) lève une erreur explicite', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1' });
    const params = makeParams({ participants: [patient], contrats: [contrat], depart: { lat: NaN, lng: NaN } });

    expect(() => planifierSemaine(params, LUNDI)).toThrow(/départ/i);
  });

  it('depart manquant (undefined) lève une erreur explicite côté Mode B aussi', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1' });
    const params = makeParams({ participants: [patient], contrats: [contrat] });
    // @ts-expect-error -- simulation d'une adresse jamais géocodée
    params.depart = undefined;

    expect(() => planifierRecurrent(params, '2026-06-24', 4)).toThrow(/départ/i);
  });
});

describe('planifierSemaine — réutilisation des séances existantes', () => {
  it('réutilise (déplace) une séance "planifiee" existante cette semaine plutôt que d\'en créer une nouvelle', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 1 });
    const seanceExistante = makeSeance({ id: 's1', participantId: 'p1', contratId: 'c1', date: LUNDI, statut: 'planifiee' });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat], seances: [seanceExistante] }), LUNDI);

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(1);
    expect(etapes[0].seanceExistanteId).toBe('s1');
    expect(etapes[0].alreadyPlanned).toBe(true);
  });

  it('ne réutilise jamais une séance "realisee" ou "annulee" — uniquement les "planifiee"', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 1 });
    const seances = [
      makeSeance({ id: 's_realisee', participantId: 'p1', contratId: 'c1', date: LUNDI, statut: 'realisee' }),
      makeSeance({ id: 's_annulee', participantId: 'p1', contratId: 'c1', date: LUNDI, statut: 'annulee' }),
    ];

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat], seances }), LUNDI);

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(1);
    // Une nouvelle séance est proposée : ni la "realisee" ni l'"annulee" ne sont réutilisées.
    expect(etapes[0].seanceExistanteId).toBeUndefined();
    expect(etapes[0].alreadyPlanned).toBeFalsy();
  });
});

describe('planifierSemaine — contrat non actif ignoré', () => {
  it('un contrat "termine" ou "suspendu" ne génère aucune séance', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', statut: 'termine' });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles).toHaveLength(0); // ignoré, pas signalé comme un cas à traiter
  });
});
