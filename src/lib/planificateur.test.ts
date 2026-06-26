import { describe, it, expect } from 'vitest';
import type { Participant, Contrat, Seance, IndisponibilitePierre, ZoneGeographique } from '../types';
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
  heureDebutJournee?: string;
  zones?: ZoneGeographique[];
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
    heureDebutJournee: opts.heureDebutJournee ?? '08:00',
    zones: opts.zones,
  };
}

function datePlusJours(base: string, j: number): string {
  const d = new Date(base + 'T12:00');
  d.setDate(d.getDate() + j);
  return d.toISOString().split('T')[0];
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

describe('planifierSemaine — protection des séances realisee/annulee', () => {
  it('une séance "realisee" ou "annulee" existante ne déclenche pas de conflit et le planificateur propose bien une nouvelle séance', () => {
    // Invariant critique : la table rase (api/seances/supprimer-planifiees) ne
    // supprime que statut='planifiee'. Le planificateur doit planifier normalement
    // même si une séance realisee ou annulee existe déjà sur la même date.
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 1 });
    const seancesExistantes = [
      makeSeance({ id: 's_realisee', participantId: 'p1', contratId: 'c1', date: LUNDI, statut: 'realisee' }),
      makeSeance({ id: 's_annulee', participantId: 'p1', contratId: 'c1', date: LUNDI, statut: 'annulee' }),
    ];

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat], seances: seancesExistantes }), LUNDI);

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(1);
    // La nouvelle séance peut être proposée sur LUNDI même si une realisee/annulee y est déjà.
    expect(etapes[0].alreadyPlanned).toBeFalsy();
  });
});

describe('planifierSemaine / planifierRecurrent — aucun doublon dans le résultat', () => {
  it('le résultat ne contient jamais deux séances pour le même (patient, date, contrat)', () => {
    // Invariant anti-doublon : après table rase, bulkCreerSeances insère toutes les
    // séances d'un coup. Si le planificateur produisait deux étapes pour le même
    // triplet (patient, date, contrat), la contrainte UNIQUE côté base échouerait.
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 2 });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    const etapes = toutesLesEtapes(r.jours);
    const cles = etapes.map(e => `${e.patient.id}|${e.date}|${e.contrat.id}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('Mode B : aucun doublon sur plusieurs semaines pour le même contrat', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 2 });

    const r = planifierRecurrent(makeParams({ participants: [patient], contrats: [contrat] }), '2026-06-24', 4);

    const etapes = toutesLesEtapes(r.jours);
    const cles = etapes.map(e => `${e.patient.id}|${e.date}|${e.contrat.id}`);
    expect(new Set(cles).size).toBe(cles.length);
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

describe('planifierSemaine — contrat exclu de la tournée', () => {
  it('un contrat actif avec exclureTournee=true ne génère aucune séance, sans apparaître en "à planifier manuellement"', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', exclureTournee: true });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles).toHaveLength(0);
  });

  it('un patient avec 2 contrats, l\'un exclu et l\'autre normal, ne reçoit une séance que pour le contrat non exclu', () => {
    const patient = makePatient({ id: 'p1' });
    const contratExclu = makeContrat({ id: 'cX', participantId: 'p1', exclureTournee: true });
    const contratNormal = makeContrat({ id: 'cN', participantId: 'p1' });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contratExclu, contratNormal] }), LUNDI);

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(1);
    expect(etapes[0].contrat.id).toBe('cN');
  });
});

describe('planifierSemaine — heures arrondies au quart d\'heure supérieur', () => {
  it('un trajet menant à une heure non ronde est arrondi au quart d\'heure supérieur, jamais inférieur', () => {
    // depart -> patient = 600 sec = 10 min de trajet (buildMatrix). Départ
    // 08:00 (déjà rond) + 10 min = 08:10, jamais rond -> doit devenir 08:15.
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1' });

    const r = planifierSemaine(makeParams({ participants: [patient], contrats: [contrat] }), LUNDI);

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(1);
    expect(etapes[0].heureDebut).toBe('08:15');
    expect(etapes[0].heureDebut.endsWith(':00') || etapes[0].heureDebut.endsWith(':15')
      || etapes[0].heureDebut.endsWith(':30') || etapes[0].heureDebut.endsWith(':45')).toBe(true);
  });
});

describe('planifierRecurrent — périodicité bi/tri-mensuelle', () => {
  // Ancrage fixe sur dateDebut (= LUNDI, la 1ère semaine traitée par
  // planifierRecurrent avec dateRef='2026-06-24') : semaine 0 = due pour tous
  // les cycles ; semaine 1 jamais due (ni 2 ni 3 semaines) ; semaine 2 due
  // seulement pour deux_semaines ; semaine 3 due seulement pour trois_semaines.
  function lundiPlusJours(j: number): string {
    const d = new Date(LUNDI + 'T12:00');
    d.setDate(d.getDate() + j);
    return d.toISOString().split('T')[0];
  }

  it('1 séance toutes les 2 semaines : due aux semaines 0 et 2, jamais aux semaines 1 et 3', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({
      id: 'c1', participantId: 'p1', dateDebut: LUNDI, periodicite: 'deux_semaines', nbSeancesSemaine: 1,
    });

    const r = planifierRecurrent(makeParams({ participants: [patient], contrats: [contrat] }), '2026-06-24', 4);

    const dates = toutesLesEtapes(r.jours).map(e => e.date).sort();
    expect(dates).toEqual([LUNDI, lundiPlusJours(14)]);
  });

  it('1 séance toutes les 3 semaines : due aux semaines 0 et 3, jamais aux semaines 1 et 2', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({
      id: 'c1', participantId: 'p1', dateDebut: LUNDI, periodicite: 'trois_semaines', nbSeancesSemaine: 1,
    });

    const r = planifierRecurrent(makeParams({ participants: [patient], contrats: [contrat] }), '2026-06-24', 4);

    const dates = toutesLesEtapes(r.jours).map(e => e.date).sort();
    expect(dates).toEqual([LUNDI, lundiPlusJours(21)]);
  });

  it('périodicité "semaine" (par défaut) : due chaque semaine, sans changement de comportement', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', dateDebut: LUNDI, nbSeancesSemaine: 1 });

    const r = planifierRecurrent(makeParams({ participants: [patient], contrats: [contrat] }), '2026-06-24', 4);

    const dates = toutesLesEtapes(r.jours).map(e => e.date).sort();
    expect(dates).toEqual([LUNDI, lundiPlusJours(7), lundiPlusJours(14), lundiPlusJours(21)]);
  });

  it('une semaine non due n\'apparaît pas en "à planifier manuellement" (ce n\'est pas un échec)', () => {
    const patient = makePatient({ id: 'p1' });
    const contrat = makeContrat({
      id: 'c1', participantId: 'p1', dateDebut: LUNDI, periodicite: 'deux_semaines', nbSeancesSemaine: 1,
    });

    const r = planifierRecurrent(makeParams({ participants: [patient], contrats: [contrat] }), '2026-06-24', 4);

    expect(r.impossibles).toHaveLength(0);
  });
});

// ── Nouvelles suites : indisponibilités + zones ────────────────────────────────

describe('planifierSemaine — indisponibilité totale du praticien', () => {
  it('un jour où Pierre est indispo 8h-20h ne reçoit aucun patient (même pas en "Créneau dépassé")', () => {
    // Patient dispo lun/mar/ven, 2 séances/semaine. Mardi 8h-20h bloqué (100%).
    // Attendu : 2 séances sur lun+ven, aucune sur mardi, aucun impossible.
    const patient = makePatient({ id: 'p1', jours: ['Lun', 'Mar', 'Ven'] });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 2 });
    const indispoMardi: IndisponibilitePierre = {
      id: 'i1', jour: 'mar', heureDebut: '08:00', heureFin: '20:00', recurrente: true,
    };

    const r = planifierSemaine(
      makeParams({ participants: [patient], contrats: [contrat], indispos: [indispoMardi] }),
      LUNDI,
    );

    const MARDI = datePlusJours(LUNDI, 1);
    const etapes = toutesLesEtapes(r.jours);

    expect(etapes).toHaveLength(2);
    expect(etapes.some(e => e.date === MARDI)).toBe(false);
    // Aucun impossible : le patient a bien 2 jours restants (lun+ven) pour ses 2 séances.
    expect(r.impossibles).toHaveLength(0);
  });

  it('si tous les jours dispo du patient sont bloqués par des indispos → patient en "impossibles"', () => {
    // Patient dispo uniquement mardi, indispo mardi toute la journée → aucun jour valide.
    const patient = makePatient({ id: 'p1', jours: ['Mar'] });
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 1 });
    const indispoMardi: IndisponibilitePierre = {
      id: 'i1', jour: 'mar', heureDebut: '08:00', heureFin: '20:00', recurrente: true,
    };

    const r = planifierSemaine(
      makeParams({ participants: [patient], contrats: [contrat], indispos: [indispoMardi] }),
      LUNDI,
    );

    expect(toutesLesEtapes(r.jours)).toHaveLength(0);
    expect(r.impossibles).toHaveLength(1);
    expect(r.impossibles[0].raison).toMatch(/indisponibilités praticien/);
  });
});

describe('planifierSemaine — indisponibilité partielle (déjeuner)', () => {
  it('une indispo 12h-13h30 ne bloque pas le jour mais décale l\'arrivée à 13h30', () => {
    // heureDebutJournee = 11h45, trajet 10 min → arrivée 12h00.
    // Indispo 12h-13h30 → poussée à 13h30 par appliquerIndispos.
    // Créneau patient : apres-midi (debut=13h30) → heureDebut = 13h30.
    const patient = makePatient({ id: 'p1', jours: ['Lun'] });
    patient.disponibilites = { joursDisponibles: ['lun'], creneauxPreference: ['apres-midi'], dureeSeanceMinutes: 45 };
    const contrat = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 1 });
    const indispoLundi: IndisponibilitePierre = {
      id: 'i1', jour: 'lun', heureDebut: '12:00', heureFin: '13:30', recurrente: true,
    };

    const r = planifierSemaine(
      makeParams({
        participants: [patient], contrats: [contrat],
        indispos: [indispoLundi], heureDebutJournee: '11:45',
      }),
      LUNDI,
    );

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(1);
    expect(etapes[0].heureDebut).toBe('13:30');
    // Le jour lundi reste disponible (indispo ne couvre que 12.5% de 08h-20h).
    expect(r.impossibles).toHaveLength(0);
  });
});

describe('planifierSemaine — zones géographiques contraignantes', () => {
  it('deux patients de la même zone finissent sur le même jour grâce au bonus de zone', () => {
    // p1 (idx 1) et p2 (idx 2) dans Zone Z, joursAssignes=['lun'].
    // p3 (idx 3) hors zone. Chacun 1 séance/semaine.
    // Sans zones : p1 sur lun, p2 sur mar (nearest-neighbor), p3 sur mer.
    // Avec zones et MALUS=0.50 : lundi coûte moins cher à p2 grâce au bonus zone → p1+p2 sur lun.
    const p1 = makePatient({ id: 'p1', lat: 1, lng: 1 });
    const p2 = makePatient({ id: 'p2', lat: 2, lng: 2 });
    const p3 = makePatient({ id: 'p3', lat: 3, lng: 3 });

    const contrat1 = makeContrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 1 });
    const contrat2 = makeContrat({ id: 'c2', participantId: 'p2', nbSeancesSemaine: 1 });
    const contrat3 = makeContrat({ id: 'c3', participantId: 'p3', nbSeancesSemaine: 1 });

    const zoneZ: ZoneGeographique = {
      id: 'z1', nom: 'Zone Z', couleur: '#000',
      participantIds: ['p1', 'p2'],
      centroide: { lat: 1.5, lng: 1.5 },
      joursAssignes: ['lun'],
    };

    const r = planifierSemaine(
      makeParams({
        participants: [p1, p2, p3],
        contrats: [contrat1, contrat2, contrat3],
        zones: [zoneZ],
      }),
      LUNDI,
    );

    const etapes = toutesLesEtapes(r.jours);
    expect(etapes).toHaveLength(3);

    const datesP1 = etapes.filter(e => e.patient.id === 'p1').map(e => e.date);
    const datesP2 = etapes.filter(e => e.patient.id === 'p2').map(e => e.date);

    // Les deux patients de la même zone doivent être planifiés le même jour.
    expect(datesP1[0]).toBe(datesP2[0]);
    // Et ce jour doit être lundi (le seul jour dans joursAssignes de la zone).
    expect(datesP1[0]).toBe(LUNDI);
  });
});
