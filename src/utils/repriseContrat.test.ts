// Reprise d'un contrat mis en pause — règle du contrat expiré pendant la
// pause, et garantie qu'aucune séance n'est jamais créée dans le passé.
//
// Fixture : le contrat « Marguery » — séance le vendredi, échéance au
// 7 décembre 2026, mis en pause avec une reprise prévue fin novembre. C'est
// un cas limite volontairement tracé ici : selon le jour où le praticien
// clique réellement sur « Reprendre », le MÊME contrat passe ou se fait
// bloquer. Ce n'est pas sa date de reprise prévue qui décide, c'est la date
// du clic.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Contrat } from '../types';
import {
  evaluerReprise,
  calculerSeancesReprise,
  prolongerDateFinUnAn,
} from './repriseContrat';
import { calculerDebutReprise } from './horaires';

// genererDatesSeances compare current.getDay() (heure LOCALE) à une date
// dérivée de toISOString() (UTC) : sur un poste à décalage positif, les deux
// horloges se désynchronisent et l'étiquette du jour ne correspond plus au
// jour de la semaine testé. Bug préexistant dans horaires.ts, hors périmètre
// ici — on fixe le fuseau, comme le fait déjà
// api/_lib/renouvellementContrats.test.ts.
beforeAll(() => {
  process.env.TZ = 'UTC';
});

// 2026 : le 27/11 et le 04/12 sont des VENDREDIS, le 07/12 est un LUNDI.
const MARGUERY_DATE_FIN = '2026-12-07';
const MARGUERY_REPRISE_PREVUE = '2026-11-27';

function marguery(overrides: Partial<Contrat> = {}): Contrat {
  return {
    id: 'contrat-marguery',
    participantId: 'p-marguery',
    dateDebut: '2026-09-04',       // un vendredi
    dateFin: MARGUERY_DATE_FIN,
    joursFixe: ['ven'],
    nbSeancesSemaine: 1,
    periodicite: 'semaine',
    heureDebut: '10:00',
    dureeMinutes: 45,
    dureesSeances: [45],
    statut: 'suspendu',
    dateCreation: '2026-09-01',
    nombreSeancesTotal: 14,
    nombreSeancesRealisees: 6,
    dateReprisePrevue: MARGUERY_REPRISE_PREVUE,
    ...overrides,
  };
}

function seancesPour(contrat: Contrat, jourDuClic: string) {
  const decision = evaluerReprise(contrat, jourDuClic);
  if (decision.type === 'bloque') throw new Error('attendu non bloquant');
  return calculerSeancesReprise({
    contrat,
    participant: undefined,
    debutGeneration: decision.debutGeneration,
    finGeneration: decision.finGeneration,
    datesDejaCouvertes: [],
  });
}

describe('calculerDebutReprise — jamais en arrière', () => {
  it('suit la date de reprise prévue si elle est encore future', () => {
    expect(calculerDebutReprise('2026-11-20', '2026-11-27')).toBe('2026-11-27');
  });

  it('repart d\'aujourd\'hui si la date de reprise prévue est dépassée', () => {
    expect(calculerDebutReprise('2026-12-01', '2026-11-27')).toBe('2026-12-01');
  });

  it('repart d\'aujourd\'hui si elle vaut exactement aujourd\'hui', () => {
    expect(calculerDebutReprise('2026-11-27', '2026-11-27')).toBe('2026-11-27');
  });

  it('repart d\'aujourd\'hui quand aucune date n\'a été saisie (pause indéterminée)', () => {
    expect(calculerDebutReprise('2026-11-27', undefined)).toBe('2026-11-27');
    expect(calculerDebutReprise('2026-11-27', null)).toBe('2026-11-27');
  });
});

describe('Marguery — le jour du clic décide, pas la date de reprise prévue', () => {
  it('clic le 27/11 : passe, reprise normale', () => {
    const decision = evaluerReprise(marguery(), '2026-11-27');
    expect(decision.type).toBe('reprend');
    if (decision.type !== 'reprend') return;
    expect(decision.debutGeneration).toBe('2026-11-27');
    expect(decision.finGeneration).toBe(MARGUERY_DATE_FIN);
  });

  it('clic le 27/11 : replanifie les deux vendredis restants', () => {
    const seances = seancesPour(marguery(), '2026-11-27');
    expect(seances.map(s => s.date)).toEqual(['2026-11-27', '2026-12-04']);
    expect(seances.every(s => s.heureDebut === '10:00' && s.dureeMinutes === 45)).toBe(true);
    expect(seances.every(s => s.statut === 'planifiee' && s.contratId === 'contrat-marguery')).toBe(true);
  });

  // Le cas vraiment limite : la date de fin n'est pas ENCORE dépassée, donc
  // la reprise passe — même s'il ne reste plus un seul vendredi à planifier.
  it('clic le 07/12 (dernier jour du contrat) : passe, rien n\'est bloqué', () => {
    const decision = evaluerReprise(marguery(), MARGUERY_DATE_FIN);
    expect(decision.type).toBe('reprend');
    expect(seancesPour(marguery(), MARGUERY_DATE_FIN)).toEqual([]);
  });

  it('clic le 08/12 : bloqué, le contrat a expiré pendant la pause', () => {
    const decision = evaluerReprise(marguery(), '2026-12-08');
    expect(decision.type).toBe('bloque');
    if (decision.type !== 'bloque') return;
    expect(decision.dateFinExpiree).toBe(MARGUERY_DATE_FIN);
  });

  // Le pense-bête ne sauve pas un contrat expiré : reprise prévue fin
  // novembre, mais le praticien clique avec deux semaines de retard.
  it('une date de reprise prévue encore « valide » ne débloque pas un contrat expiré', () => {
    const decision = evaluerReprise(marguery({ dateReprisePrevue: '2026-11-27' }), '2026-12-21');
    expect(decision.type).toBe('bloque');
  });
});

describe('Contrat à durée indéterminée expiré pendant la pause', () => {
  it('est prolongé silencieusement, sans blocage', () => {
    const contrat = marguery({ dureeIndeterminee: true });
    const decision = evaluerReprise(contrat, '2026-12-08');
    expect(decision.type).toBe('prolonge');
    if (decision.type !== 'prolonge') return;
    // Même règle que calculerNouvelleDateFin du cron : +1 an sur l'échéance.
    expect(decision.nouvelleDateFin).toBe('2027-12-07');
    expect(decision.finGeneration).toBe('2027-12-07');
  });

  it('prolongerDateFinUnAn ajoute exactement un an', () => {
    expect(prolongerDateFinUnAn('2026-12-07')).toBe('2027-12-07');
    expect(prolongerDateFinUnAn('2026-02-28')).toBe('2027-02-28');
  });

  it('ne bloque jamais, même expiré depuis des mois', () => {
    const decision = evaluerReprise(marguery({ dureeIndeterminee: true }), '2027-06-15');
    expect(decision.type).toBe('prolonge');
  });

  // Symétrique : à durée fixe, la même situation bloque. C'est la seule
  // différence entre les deux cas.
  it('à durée fixe, la même situation bloque', () => {
    expect(evaluerReprise(marguery({ dureeIndeterminee: false }), '2027-06-15').type).toBe('bloque');
  });
});

describe('Aucune séance dans le passé, jamais', () => {
  it('ne génère rien avant le jour du clic, même après une longue pause', () => {
    // Pause posée en septembre, reprise prévue fin novembre, clic le 04/12 :
    // les vendredis de septembre à novembre ne doivent PAS réapparaître.
    const seances = seancesPour(marguery(), '2026-12-04');
    expect(seances.map(s => s.date)).toEqual(['2026-12-04']);
    expect(seances.every(s => s.date >= '2026-12-04')).toBe(true);
  });

  it('ne génère rien avant aujourd\'hui quand la date de reprise prévue est dépassée', () => {
    const contrat = marguery({ dateReprisePrevue: '2026-10-02' });
    const seances = seancesPour(contrat, '2026-11-27');
    expect(seances.every(s => s.date >= '2026-11-27')).toBe(true);
    expect(seances.map(s => s.date)).toEqual(['2026-11-27', '2026-12-04']);
  });

  it('démarre à la date de reprise prévue quand elle est encore future', () => {
    const seances = seancesPour(marguery(), '2026-11-10');
    // Débute au 27/11 (reprise prévue), pas au 13/11 ni au 20/11.
    expect(seances.map(s => s.date)).toEqual(['2026-11-27', '2026-12-04']);
  });

  it('un contrat à durée indéterminée expiré ne régénère pas le passé non plus', () => {
    const contrat = marguery({ dureeIndeterminee: true, dateFin: '2026-06-05' });
    const decision = evaluerReprise(contrat, '2026-11-27');
    expect(decision.type).toBe('prolonge');
    if (decision.type !== 'prolonge') return;
    const seances = calculerSeancesReprise({
      contrat, participant: undefined,
      debutGeneration: decision.debutGeneration,
      finGeneration: decision.finGeneration,
      datesDejaCouvertes: [],
    });
    expect(seances.length).toBeGreaterThan(0);
    expect(seances.every(s => s.date >= '2026-11-27')).toBe(true);
  });
});

describe('Garde-fous de génération', () => {
  it('ignore les dates déjà pourvues (contrainte d\'unicité)', () => {
    const decision = evaluerReprise(marguery(), '2026-11-27');
    if (decision.type !== 'reprend') throw new Error('attendu reprend');
    const seances = calculerSeancesReprise({
      contrat: marguery(), participant: undefined,
      debutGeneration: decision.debutGeneration,
      finGeneration: decision.finGeneration,
      datesDejaCouvertes: ['2026-11-27'],
    });
    expect(seances.map(s => s.date)).toEqual(['2026-12-04']);
  });

  it('ne génère rien si jours_fixe est vide (contrat ancien, jamais rétro-rempli)', () => {
    const contrat = marguery({ joursFixe: [] });
    const decision = evaluerReprise(contrat, '2026-11-27');
    if (decision.type !== 'reprend') throw new Error('attendu reprend');
    expect(calculerSeancesReprise({
      contrat, participant: undefined,
      debutGeneration: decision.debutGeneration,
      finGeneration: decision.finGeneration,
      datesDejaCouvertes: [],
    })).toEqual([]);
  });

  it('apparie jours_fixe[i] et durees_seances[i] dans l\'ordre de la semaine', () => {
    // Saisi dans le désordre : ven (60 min) doit rester apparié à ven.
    const contrat = marguery({ joursFixe: ['ven', 'mar'], dureesSeances: [30, 60], nbSeancesSemaine: 2, dateReprisePrevue: undefined });
    const seances = seancesPour(contrat, '2026-11-24'); // mardi 24/11
    const mardi = seances.find(s => s.date === '2026-11-24');
    const vendredi = seances.find(s => s.date === '2026-11-27');
    // ORDRE_JOURS_SEMAINE : mar (index 0) → 30 min, ven (index 1) → 60 min.
    expect(mardi?.dureeMinutes).toBe(30);
    expect(vendredi?.dureeMinutes).toBe(60);
  });

  it('rend les séances triées chronologiquement', () => {
    const contrat = marguery({ joursFixe: ['ven', 'mar'], dureesSeances: [30, 60], nbSeancesSemaine: 2, dateReprisePrevue: undefined });
    const dates = seancesPour(contrat, '2026-11-24').map(s => s.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
