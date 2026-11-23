import { describe, it, expect } from 'vitest';
import type { Bilan, Seance } from '../types';
import {
  echeanceBilan, bilanAFaire, resultatsCles, prochaineSeance, libelleRendezVous,
  seancesNonConfirmees, bornesSemaine, elementsATraiter,
} from './tableauDeBord';

const JOUR = '2026-11-23'; // lundi

function seance(id: string, date: string, heureDebut: string, statut: Seance['statut'] = 'planifiee', participantId = 'p1'): Seance {
  return { id, participantId, date, heureDebut, heureFin: `${String(Number(heureDebut.slice(0, 2)) + 1).padStart(2, '0')}:00`, dureeMinutes: 60, type: 'seance', statut, adresse: '' } as Seance;
}

describe('echeanceBilan', () => {
  it('demande un bilan initial quand il n’y en a aucun', () => {
    expect(echeanceBilan([], JOUR)).toEqual({ etat: 'initial', libelle: 'Bilan initial à faire' });
  });
  it('compte 85 jours après le dernier bilan, comme « Bilans à faire »', () => {
    expect(echeanceBilan([{ date: '2026-11-01' }], JOUR)).toEqual({ etat: 'a_jour', libelle: 'Dans 9 sem.' });
    expect(echeanceBilan([{ date: '2026-09-08' }], JOUR)).toEqual({ etat: 'bientot', libelle: 'Dans 9 j' });
    expect(echeanceBilan([{ date: '2026-08-30' }], JOUR)).toEqual({ etat: 'retard', libelle: 'À faire aujourd’hui' });
    expect(echeanceBilan([{ date: '2026-08-01' }], JOUR)).toEqual({ etat: 'retard', libelle: 'En retard de 4 sem.' });
  });
  it('prend le bilan le plus récent quel que soit l’ordre', () => {
    expect(echeanceBilan([{ date: '2026-11-01' }, { date: '2026-01-01' }], JOUR).etat).toBe('a_jour');
  });
  it('bilanAFaire suit la même règle', () => {
    expect(bilanAFaire([], JOUR)).toBe(true);
    expect(bilanAFaire([{ date: '2026-08-01' }], JOUR)).toBe(true);
    expect(bilanAFaire([{ date: '2026-11-01' }], JOUR)).toBe(false);
  });
});

describe('resultatsCles', () => {
  const base = {
    tug3m: 9, chairStand30: 13, handGrip: { droite: 21, gauche: null },
    tm6: { distanceMetres: 410 },
  } as unknown as Bilan;

  it('donne les quatre résultats avec leur niveau', () => {
    const r = resultatsCles(base);
    expect(r.map(x => x.cle)).toEqual(['tug', 'lever', 'grip', 'tm6']);
    // Normes de norms.ts : TUG 9 s → note 4 (dans la norme) ; TM6 410 m → note 4.
    expect(r[0]).toMatchObject({ valeur: '9 s', niveau: 'norme' });
    expect(r[3]).toMatchObject({ valeur: '410 m', niveau: 'norme' });
    expect(resultatsCles({ ...base, tug3m: 12 } as Bilan)[0].niveau).toBe('surveiller');
    expect(resultatsCles({ ...base, tug3m: 25 } as Bilan)[0].niveau).toBe('difficulte');
  });
  it('omet un test non fait au lieu d’afficher 0', () => {
    expect(resultatsCles({ ...base, tug3m: null } as Bilan).map(x => x.cle)).toEqual(['lever', 'grip', 'tm6']);
  });
  it('ne colore pas un TM6 en pas (aucune norme commune avec les mètres)', () => {
    const r = resultatsCles({ ...base, tm6: { mode: 'stepper', repetitions: 650, distanceMetres: null } } as unknown as Bilan);
    expect(r.at(-1)?.niveau).toBeNull();
  });
  it('rien sans bilan', () => {
    expect(resultatsCles(undefined)).toEqual([]);
  });
});

describe('prochaineSeance', () => {
  const liste = [
    seance('passee', JOUR, '08:00'),
    seance('annulee', JOUR, '15:00', 'annulee'),
    seance('apres', '2026-11-25', '09:00'),
    seance('ce-soir', JOUR, '17:00'),
    seance('autre', JOUR, '16:00', 'planifiee', 'p2'),
  ];
  it('prend la première séance planifiée à venir de ce bénéficiaire', () => {
    expect(prochaineSeance(liste, 'p1', JOUR, '10:00')?.id).toBe('ce-soir');
    expect(prochaineSeance(liste, 'p1', JOUR, '18:00')?.id).toBe('apres');
  });
});

describe('libelleRendezVous', () => {
  it('parle comme un agenda', () => {
    expect(libelleRendezVous({ date: JOUR, heureDebut: '14:30:00' }, JOUR)).toBe('Aujourd’hui · 14:30');
    expect(libelleRendezVous({ date: '2026-11-24', heureDebut: '09:00' }, JOUR)).toBe('Demain · 09:00');
    expect(libelleRendezVous({ date: '2026-11-26', heureDebut: '09:00' }, JOUR)).toBe('Jeu. 26 · 09:00');
  });
});

describe('seancesNonConfirmees', () => {
  it('séances passées encore planifiées, sans limite de date (retour de Pierre)', () => {
    const r = seancesNonConfirmees([
      seance('hier', '2026-11-22', '10:00'),
      seance('faite', '2026-11-22', '11:00', 'realisee'),
      seance('vieille', '2026-08-01', '10:00'),
      seance('matin', JOUR, '08:00'),
      seance('plus-tard', JOUR, '15:00'),
    ], JOUR, '12:00');
    expect(r.map(s => s.id).sort()).toEqual(['hier', 'matin', 'vieille']);
  });
});

describe('bornesSemaine', () => {
  it('du lundi au dimanche, dimanche compris dans la semaine qui finit', () => {
    expect(bornesSemaine(JOUR)).toEqual({ lundi: '2026-11-23', dimanche: '2026-11-29' });
    expect(bornesSemaine('2026-11-29')).toEqual({ lundi: '2026-11-23', dimanche: '2026-11-29' });
  });
});

describe('elementsATraiter', () => {
  const vide = { nbSeancesNonConfirmees: 0, ressentis: [], brouillons: [], contratsARenouveler: [], contratsSansJours: [] };
  it('ne montre rien quand tout est à jour', () => {
    expect(elementsATraiter(vide)).toEqual([]);
  });
  it('regroupe les points dans l’ordre facture, santé, administratif', () => {
    const l = elementsATraiter({
      nbSeancesNonConfirmees: 2,
      ressentis: [{ id: 'r', nom: 'A B' }],
      brouillons: [{ participantId: 'b', nom: 'C D', etape: 1 }],
      contratsARenouveler: [{ participantId: 'c', nom: 'E F', joursRestants: 1 }],
      contratsSansJours: [{ participantId: 'j', nom: 'G H' }],
    });
    expect(l.map(x => x.type)).toEqual(['seances', 'ressentis', 'brouillon', 'contrat', 'contrat_jours']);
    expect(l[0]).toMatchObject({ titre: '2 séances à confirmer', lien: '/factures/seances' });
    expect(l[1].gravite).toBe('haute');
    expect(l[2].detail).toBe('C D · arrêté à l’étape 2');
    expect(l[3].detail).toBe('E F · dans 1 jour');
  });
});
