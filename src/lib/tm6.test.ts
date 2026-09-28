import { describe, it, expect } from 'vitest';
import type { Bilan } from '../types';
import { bilanToDb, dbToBilan } from './mappers';
import { lireMesures, ecrireMesures, mesuresParDefaut, resultatTm6, distanceTm6, tm6NonComparableADistance } from './tm6';

type Tm6 = Bilan['tm6'];
const base: Tm6 = {
  distanceMetres: null, fcAvant: null, fcApres: null, fc2min: null,
  spo2Avant: null, spo2Apres: null, spo22min: null, borgRPE: null,
  dureeMode: 'fixe', dureeCibleSecondes: 360, dureeReelleSecondes: 360,
  nbPauses: 0, dureePausesSecondes: 0, notesPauses: '',
};

describe('résultat du TMC selon le mode', () => {
  it('A — marche : 420 m', () => {
    const r = resultatTm6({ ...base, distanceMetres: 420 });
    expect(r).toMatchObject({ type: 'distance', valeur: 420, texte: '420 m' });
    expect(distanceTm6({ ...base, distanceMetres: 420 })).toBe(420);
  });
  it('B — stepper : 650 pas, jamais 0 m', () => {
    const t = { ...base, mode: 'stepper' as const, repetitions: 650, distanceMetres: 0 };
    expect(resultatTm6(t)).toMatchObject({ type: 'pas', valeur: 650, texte: '650 pas', modeLabel: 'Stepper' });
    expect(distanceTm6(t)).toBeNull();
  });
  it('C — marche sur place : 720 pas', () => {
    const t = { ...base, mode: 'marche_sur_place' as const, repetitions: 720, distanceMetres: 0 };
    expect(resultatTm6(t)).toMatchObject({ type: 'pas', valeur: 720, texte: '720 pas' });
  });
  it('lit aussi nbPas, et une variante en pas sans mode', () => {
    expect(resultatTm6({ ...base, mode: 'marche_sur_place', nbPas: 850, distanceMetres: 0 }).texte).toBe('850 pas');
    expect(resultatTm6({ ...base, distanceMetres: 0, repetitions: 300 }).texte).toBe('300 pas');
  });
  it('sans donnée : pas de valeur', () => {
    expect(resultatTm6(base).valeur).toBeNull();
    expect(resultatTm6(undefined).texte).toBe('—');
  });
  it('PR B — ancien Stepper (mode NULL, pas renseignés) : jamais étiqueté "Marche"', () => {
    const r = resultatTm6({ ...base, nbPas: 650, distanceMetres: 0 });
    expect(r).toMatchObject({ type: 'pas', valeur: 650, texte: '650 pas', modeLabel: 'Stepper' });
  });
  it('PR B — ancien Stepper via repetitions (mode NULL) : jamais étiqueté "Marche"', () => {
    const r = resultatTm6({ ...base, repetitions: 650, distanceMetres: 0 });
    expect(r.modeLabel).toBe('Stepper');
  });
  it('PR B — anciens tours (mode NULL, nb_tours renseigné) : jamais étiqueté "Marche"', () => {
    const r = resultatTm6({ ...base, nbTours: 12 });
    expect(r).toMatchObject({ type: 'tours', valeur: 12, texte: '12 tours', modeLabel: 'Tours' });
  });
  it('PR B — mode explicite : le libellé du mode prime toujours', () => {
    expect(resultatTm6({ ...base, mode: 'stepper', repetitions: 650, distanceMetres: 0 }).modeLabel).toBe('Stepper');
    expect(resultatTm6({ ...base, mode: 'marche_sur_place', repetitions: 720, distanceMetres: 0 }).modeLabel).toBe('Marche sur place');
    expect(resultatTm6({ ...base, mode: 'standard', distanceMetres: 420 }).modeLabel).toBe('Marche');
  });
});

describe('PR C — tm6NonComparableADistance : jamais noter un résultat en pas comme 0 m', () => {
  it('distance : comparable, jamais signalé', () => {
    expect(tm6NonComparableADistance({ ...base, distanceMetres: 420 })).toBe(false);
  });
  it('stepper récent (mode explicite) : non comparable', () => {
    expect(tm6NonComparableADistance({ ...base, mode: 'stepper', repetitions: 650, distanceMetres: 0 })).toBe(true);
  });
  it('ancien Stepper (mode NULL, nb_pas renseigné) : non comparable', () => {
    expect(tm6NonComparableADistance({ ...base, nbPas: 650, distanceMetres: 0 })).toBe(true);
  });
  it('anciens tours (mode NULL, nb_tours renseigné) : non comparable', () => {
    expect(tm6NonComparableADistance({ ...base, nbTours: 12 })).toBe(true);
  });
  it('aucune donnée : pas signalé (ce n\'est pas "non comparable", c\'est "rien à comparer")', () => {
    expect(tm6NonComparableADistance(base)).toBe(false);
    expect(tm6NonComparableADistance(undefined)).toBe(false);
  });
});

describe('tableau unique', () => {
  it('E — 9 lignes par défaut', () => {
    const m = mesuresParDefaut();
    expect(m).toHaveLength(9);
    expect(m.map(l => l.label)).toEqual([
      'Avant le test', 'Minute 1', 'Minute 2', 'Minute 3', 'Minute 4', 'Minute 5', 'Minute 6',
      'Récupération 1 min', 'Récupération 2 min',
    ]);
  });

  it('F — ancien TMC (deux tableaux) : rien n\'est perdu', () => {
    const ancien: Tm6 = {
      ...base, fcAvant: 72, spo2Avant: 98, fcApres: 108, spo2Apres: 96,
      fc1min: 95, spo21min: 97, fc2min: 88, spo22min: 98,
      mesuresParMinute: [
        { bpm: 80, spo2: 97 }, { bpm: 90, spo2: 97 }, { bpm: 95, spo2: 96 },
        { bpm: 100, spo2: 96 }, { bpm: 105, spo2: 95 }, { bpm: 108, spo2: 95 },
      ],
    };
    const m = lireMesures(ancien);
    const par = (label: string) => m.find(l => l.label === label)!;
    expect(par('Avant le test')).toMatchObject({ bpm: 72, spo2: 98 });
    expect(par('Minute 3')).toMatchObject({ bpm: 95, spo2: 96 });
    expect(par('Minute 6')).toMatchObject({ bpm: 108, spo2: 95 });
    expect(par('Juste après')).toMatchObject({ bpm: 108, spo2: 96 });
    expect(par('Récupération 1 min')).toMatchObject({ bpm: 95, spo2: 97 });
    expect(par('Récupération 2 min')).toMatchObject({ bpm: 88, spo2: 98 });
  });

  it('ancien TMC sans mesures par minute : 9 lignes, valeurs avant/récup conservées', () => {
    const m = lireMesures({ ...base, fcAvant: 70, fc2min: 85 });
    expect(m).toHaveLength(9);
    expect(m[0].bpm).toBe(70);
    expect(m[8].bpm).toBe(85);
  });

  it('E/F — ajout, suppression, aller-retour de sauvegarde sans perte', () => {
    let m = lireMesures({ ...base, fcAvant: 72, fc2min: 88 });
    m[1] = { ...m[1], bpm: 90 };
    m.push({ kind: 'minute', label: 'Minute 7', bpm: 111, spo2: 94 }); // ajout
    m = m.filter(l => l.label !== 'Minute 2'); // suppression
    const sauve = { ...base, ...ecrireMesures(m) };
    const relu = lireMesures(sauve);
    expect(relu).toEqual(m);
    expect(sauve.fcAvant).toBe(72);   // colonnes historiques recopiées
    expect(sauve.fc2min).toBe(88);
    expect(relu.find(l => l.label === 'Minute 1')?.bpm).toBe(90);
  });

  it('colonnes historiques : fcApres = dernière minute renseignée', () => {
    const m = mesuresParDefaut();
    m[6] = { ...m[6], bpm: 120, spo2: 93 };
    expect(ecrireMesures(m)).toMatchObject({ fcApres: 120, spo2Apres: 93 });
  });
});

describe('enregistrement : seule la valeur du mode actif est écrite', () => {
  const ligne = (tm6: Partial<Tm6>) =>
    bilanToDb('p-1', { tm6: { ...base, ...tm6 } } as unknown as Omit<Bilan, 'id'>);

  it('stepper : la distance restée à l\'écran n\'est pas enregistrée, les pas oui', () => {
    const row = ligne({ mode: 'stepper', distanceMetres: 420, repetitions: 650, nbPas: 650 });
    expect(row.tm6_distance_metres).toBeNull();
    expect(row.tm6_repetitions).toBe(650);
  });
  it('marche : les pas restés à l\'écran ne sont pas enregistrés, la distance oui', () => {
    const row = ligne({ mode: 'standard', distanceMetres: 420, repetitions: 650, nbPas: 650 });
    expect(row.tm6_distance_metres).toBe(420);
    expect(row.tm6_repetitions).toBeNull();
    expect(row.tm6_nb_pas).toBeNull();
  });
  it('variante en pas : les pas sont conservés', () => {
    expect(ligne({ mode: 'standard', varianteId: 'v1', repetitions: 300 }).tm6_repetitions).toBe(300);
  });
  it('relecture d\'un TMC stepper : 650 pas, jamais 0 m', () => {
    const row = ligne({ mode: 'stepper', distanceMetres: 0, repetitions: 650 });
    const relu = dbToBilan({ ...row, id: 'b1' });
    expect(resultatTm6(relu.tm6).texte).toBe('650 pas');
  });
});
