import { describe, it, expect } from 'vitest';
import type { Bilan, Seance } from '../types';
import {
  libelleDelai, delaiRendezVous, prochainRendezVous, phraseDuJour, contexteBeneficiaire,
  progresDepuisInitial, prochainsBilans, resumeFactures, astuceDuJour, ASTUCES,
} from './tableauDeBord';

const JOUR = '2026-11-23'; // lundi

function seance(id: string, date: string, heureDebut: string, statut: Seance['statut'] = 'planifiee', participantId = 'p1'): Seance {
  return { id, participantId, date, heureDebut, heureFin: '23:00', dureeMinutes: 60, type: 'seance', statut, adresse: '' } as Seance;
}

function bilan(date: string, v: Partial<{ tug3m: number | null; chairStand30: number | null; grip: number | null; tm6: number | null }>, extra: Partial<Bilan> = {}): Bilan {
  return {
    date, tug3m: v.tug3m ?? null, chairStand30: v.chairStand30 ?? null,
    handGrip: { droite: v.grip ?? null, gauche: null },
    tm6: v.tm6 != null ? { mode: 'distance', distanceMetres: v.tm6 } : null,
    pointsVigilance: '', ...extra,
  } as unknown as Bilan;
}

describe('libelleDelai', () => {
  it('parle comme on parle', () => {
    expect(libelleDelai(3)).toBe('maintenant');
    expect(libelleDelai(25)).toBe('dans 25 min');
    expect(libelleDelai(130)).toBe('dans 2 h 10');
    expect(libelleDelai(180)).toBe('dans 3 h');
  });
});

describe('prochainRendezVous et delaiRendezVous', () => {
  it('prend le prochain rendez-vous planifié, tous bénéficiaires confondus', () => {
    const s = [seance('a', JOUR, '09:00'), seance('b', JOUR, '14:30', 'planifiee', 'p2'), seance('c', JOUR, '11:00', 'annulee')];
    expect(prochainRendezVous(s, JOUR, '10:00')?.id).toBe('b');
    expect(delaiRendezVous(s[1], JOUR, '12:20')).toBe('dans 2 h 10');
  });
  it('dit « demain » ou le jour de la semaine', () => {
    expect(delaiRendezVous(seance('x', '2026-11-24', '09:00'), JOUR, '20:00')).toBe('demain');
    expect(delaiRendezVous(seance('x', '2026-11-26', '09:00'), JOUR, '20:00')).toBe('jeudi');
  });
});

describe('phraseDuJour', () => {
  it('raconte une journée chargée', () => {
    expect(phraseDuJour({ nbRendezVous: 4, prochainDans: 'dans 2 h 10', nbAConfirmer: 2, nbBilansAujourdhui: 1 }))
      .toBe('Une journée bien remplie : 4 rendez-vous, le prochain dans 2 h 10. Un bilan est prévu aujourd’hui. 2 séances attendent juste votre confirmation.');
  });
  it('encourage quand la journée est libre', () => {
    expect(phraseDuJour({ nbRendezVous: 0, prochainDans: null, nbAConfirmer: 0, nbBilansAujourdhui: 0 }))
      .toBe('Aucun rendez-vous aujourd’hui : un bon moment pour préparer vos bilans et vos programmes.');
  });
  it('sait quand tout est passé', () => {
    expect(phraseDuJour({ nbRendezVous: 2, prochainDans: null, nbAConfirmer: 1, nbBilansAujourdhui: 0 }))
      .toBe('Aujourd’hui : 2 rendez-vous, tous passés. Une séance attend juste votre confirmation.');
  });
});

describe('contexteBeneficiaire', () => {
  it('reprend l’objectif le plus récent et la vigilance du dernier bilan', () => {
    const b = [
      bilan('2026-06-01', {}, { profilEnrichi: { objectifsPersonnels: 'Marcher jusqu’au marché' } as Bilan['profilEnrichi'], pointsVigilance: 'ancien' }),
      bilan('2026-09-01', {}, { pointsVigilance: ' Genou droit sensible ' }),
    ];
    expect(contexteBeneficiaire(b)).toEqual({ objectif: 'Marcher jusqu’au marché', vigilance: 'Genou droit sensible' });
  });
  it('ne renvoie rien quand rien n’est noté', () => {
    expect(contexteBeneficiaire([bilan('2026-09-01', {})])).toEqual({ objectif: null, vigilance: null });
  });
});

describe('progresDepuisInitial', () => {
  it('choisit le progrès le plus parlant', () => {
    const p = progresDepuisInitial([bilan('2026-03-01', { tug3m: 14, chairStand30: 8 }), bilan('2026-09-01', { tug3m: 10, chairStand30: 9 })]);
    expect(p).toEqual({ test: 'au TUG', delta: '−4 s', sens: 'Se lever et marcher 3 m plus vite : moins de risque de chute.' });
  });
  it('ne montre jamais un recul ni une variation minime', () => {
    expect(progresDepuisInitial([bilan('2026-03-01', { tug3m: 10 }), bilan('2026-09-01', { tug3m: 12 })])).toBeNull();
    expect(progresDepuisInitial([bilan('2026-03-01', { tm6: 400 }), bilan('2026-09-01', { tm6: 410 })])).toBeNull();
  });
  it('a besoin de deux bilans', () => {
    expect(progresDepuisInitial([bilan('2026-03-01', { tug3m: 10 })])).toBeNull();
  });
  it('écrit les décimales à la française', () => {
    expect(progresDepuisInitial([bilan('2026-03-01', { tug3m: 12.4 }), bilan('2026-09-01', { tug3m: 10.9 })])?.delta).toBe('−1,5 s');
  });
});

describe('prochainsBilans', () => {
  it('trie par urgence : retard, initial, bientôt, puis à jour', () => {
    const r = prochainsBilans([
      { id: 'ajour', bilans: [{ date: '2026-11-01' }] },
      { id: 'retard', bilans: [{ date: '2026-07-01' }] },
      { id: 'initial', bilans: [] },
      { id: 'bientot', bilans: [{ date: '2026-09-08' }] },
    ], JOUR);
    expect(r.map(x => x.participantId)).toEqual(['retard', 'initial', 'bientot', 'ajour']);
    expect(r[1].type).toBe('Bilan initial');
    expect(r[0].type).toBe('2e bilan');
  });
});

describe('resumeFactures', () => {
  it('compte sans jamais modifier', () => {
    expect(resumeFactures(2, [
      { type: 'facture', statut: 'en_retard' }, { type: 'facture', statut: 'envoyee' },
      { type: 'facture', statut: 'validee' }, { type: 'facture', statut: 'payee' }, { type: 'avoir', statut: 'validee' },
    ])).toEqual({ aValider: 2, enRetard: 1, nonReglees: 2 });
  });
});

describe('astuceDuJour', () => {
  it('saute les astuces écartées et s’arrête quand tout est vu', () => {
    const toutes = new Set(ASTUCES.map(a => a.cle));
    expect(astuceDuJour(JOUR, toutes)).toBeNull();
    const sauf = new Set([...toutes].filter(c => c !== 'dictee'));
    expect(astuceDuJour(JOUR, sauf)?.cle).toBe('dictee');
  });
});
