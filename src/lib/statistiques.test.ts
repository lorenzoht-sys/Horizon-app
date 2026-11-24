import { describe, it, expect } from 'vitest';
import type { Bilan, Seance, TarifContrat } from '../types';
import {
  ajouterJours, lundiDe, moisDecale, derniersMois, formaterHeures, presenceRecente, activiteMoisADate,
  semaines, caParMois, encaissements, valeurSeances, annulations, sourcesCA, partPremierBeneficiaire,
  portefeuille, parStructure, assiduiteParBeneficiaire, resultatsParTest, phrasesDuMois,
} from './statistiques';

const JOUR = '2026-11-24'; // mardi

function s(date: string, statut: Seance['statut'], participantId = 'p1', extra: Partial<Seance> = {}) {
  return { date, statut, participantId, ...extra };
}

function bilan(date: string, champs: Partial<Bilan>): Bilan {
  return { date, ...champs } as Bilan;
}

function tarif(contratId: string, tarifSeance: number, depuis = '2026-01-01', fraisDeplacement = 0): TarifContrat {
  return { id: `t-${contratId}-${depuis}`, contratId, tarifSeance, fraisDeplacement, dateDebutValidite: depuis, createdAt: depuis };
}

describe('dates', () => {
  it('ajoute des jours en traversant les mois et les années', () => {
    expect(ajouterJours('2026-11-30', 1)).toBe('2026-12-01');
    expect(ajouterJours('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('trouve le lundi de la semaine', () => {
    expect(lundiDe(JOUR)).toBe('2026-11-23');
    expect(lundiDe('2026-11-29')).toBe('2026-11-23'); // dimanche
  });
  it('décale les mois et liste les 12 derniers', () => {
    expect(moisDecale('2026-01', -1)).toBe('2025-12');
    const m = derniersMois(JOUR);
    expect(m).toHaveLength(12);
    expect([m[0], m[11]]).toEqual(['2025-12', '2026-11']);
  });
  it('formate les heures', () => {
    expect(formaterHeures(90)).toBe('1 h 30');
    expect(formaterHeures(720)).toBe('12 h');
  });
});

describe('presenceRecente', () => {
  it('ne compte pas les séances à venir ni celles du jour comme des absences', () => {
    expect(presenceRecente([s('2026-11-20', 'realisee'), s(JOUR, 'planifiee'), s('2026-11-28', 'planifiee')], JOUR))
      .toEqual({ realisees: 1, annulees: 0, nonPointees: 0, taux: 100 });
  });
  it('compte les annulées, ignore les reportées et signale les séances non pointées', () => {
    expect(presenceRecente([
      s('2026-11-10', 'realisee'), s('2026-11-12', 'realisee'), s('2026-11-13', 'realisee'),
      s('2026-11-17', 'annulee'), s('2026-11-18', 'reportee'), s('2026-11-19', 'planifiee'),
    ], JOUR)).toEqual({ realisees: 3, annulees: 1, nonPointees: 1, taux: 75 });
  });
  it('rend un taux null quand il n’y a rien à compter', () => {
    expect(presenceRecente([], JOUR).taux).toBeNull();
  });
});

describe('activiteMoisADate', () => {
  it('compte les heures, cours collectifs compris, et compare au mois précédent à date égale', () => {
    const r = activiteMoisADate(
      [
        s('2026-11-03', 'realisee', 'p1', { dureeMinutes: 60 }), s('2026-11-26', 'planifiee', 'p1', { dureeMinutes: 45 }),
        s('2026-10-05', 'realisee', 'p1', { dureeMinutes: 60 }), s('2026-10-25', 'realisee', 'p1', { dureeMinutes: 60 }),
      ],
      [{ date: '2026-11-10', statut: 'realise', dureeMinutes: 90 }, { date: '2026-11-30', statut: 'planifie', dureeMinutes: 60 }],
      JOUR,
    );
    expect(r).toEqual({ minutes: 150, minutesMoisPrecedent: 60, minutesPrevues: 105, seancesPrevues: 2 });
  });
  it('borne à la fin d’un mois plus court', () => {
    expect(activiteMoisADate([s('2026-02-28', 'realisee', 'p1', { dureeMinutes: 60 })], [], '2026-03-31').minutesMoisPrecedent).toBe(60);
  });
});

describe('semaines', () => {
  it('rend 12 semaines du lundi au dimanche, en heures', () => {
    const sem = semaines(
      [s('2026-11-23', 'realisee', 'p1', { dureeMinutes: 45 }), s('2026-11-29', 'annulee', 'p1', { dureeMinutes: 60 })],
      [{ date: '2026-11-24', statut: 'realise', dureeMinutes: 60 }],
      JOUR,
    );
    expect(sem).toHaveLength(12);
    expect(sem[11]).toEqual({ debut: '2026-11-23', libelle: '23/11', realisees: 2, annulees: 1, heures: 1.75, heuresAnnulees: 1 });
    expect(sem[0].debut).toBe('2026-09-07');
  });
});

describe('caParMois', () => {
  it('additionne factures émises, CA externe et brouillons du mois', () => {
    const r = caParMois(
      [{ mois: '2026-10-01', participantId: 'a', horizon: 400, externe: 50 }, { mois: '2026-11-01', participantId: 'a', horizon: 0, externe: 20 }],
      [{ periode: '2026-11-01', totalHt: 300 }, { periode: '2026-10-01', totalHt: 100 }],
      ['2026-10', '2026-11'],
    );
    expect(r).toEqual([
      { mois: '2026-10', facture: 450, enPreparation: 100, total: 550 },
      { mois: '2026-11', facture: 20, enPreparation: 300, total: 320 },
    ]);
  });
});

describe('encaissements', () => {
  const f = (id: string, statut: string, total: number, paye = 0, extra: object = {}) => ({
    id, type: 'facture' as const, statut, total, paye, dateEmission: '2026-10-01', datePaiement: null, factureOrigineId: null, ...extra,
  });
  it('calcule le reste dû, avoirs et paiements partiels déduits, et le retard', () => {
    const r = encaissements([
      f('1', 'envoyee', 300, 100),
      f('2', 'en_retard', 200),
      f('3', 'validee', 150),
      { ...f('a', 'validee', 50), type: 'avoir', factureOrigineId: '3' },
      f('4', 'payee', 100, 100, { datePaiement: '2026-10-11' }),
      f('5', 'payee', 100, 100, { datePaiement: '2026-10-21' }),
      f('6', 'annulee', 999),
    ], JOUR);
    expect(r).toEqual({ resteDu: 500, nbAttente: 3, enRetard: 200, nbEnRetard: 1, delaiMoyen: 15 });
  });
});

describe('valeurSeances', () => {
  it('valorise au tarif applicable à la date, déplacement compris, sans rien inventer', () => {
    const r = valeurSeances(
      [s('2026-11-26', 'planifiee', 'p1', { contratId: 'c1' }), s('2026-12-02', 'planifiee', 'p1', { contratId: 'c1' }), s('2026-11-27', 'planifiee', 'p2')],
      { c1: [{ ...tarif('c1', 40, '2026-01-01', 5), dateFinValidite: '2026-11-30' }, tarif('c1', 50, '2026-12-01', 5)] },
    );
    expect(r).toEqual({ montant: 100, valorisees: 2, sansTarif: 1 });
  });
});

describe('annulations', () => {
  it('compte les annulations passées par motif et les heures perdues', () => {
    const r = annulations([
      s('2026-11-01', 'annulee', 'p1', { motifAnnulation: 'maladie', dureeMinutes: 60 }),
      s('2026-11-02', 'annulee', 'p1', { motifAnnulation: 'maladie', dureeMinutes: 45 }),
      s('2026-11-03', 'annulee', 'p2', { dureeMinutes: 60 }),
      s('2026-11-04', 'realisee', 'p2'),
      s('2026-11-30', 'annulee', 'p2'),
    ], JOUR);
    expect(r.annulees).toBe(3);
    expect(r.total).toBe(4);
    expect(r.minutesPerdues).toBe(165);
    expect(r.motifs[0]).toEqual({ motif: 'maladie', libelle: 'Maladie', n: 2 });
    expect(r.motifs[1].libelle).toBe('Motif non renseigné');
  });
});

describe('sourcesCA', () => {
  it('répartit le CA entre structures et particuliers', () => {
    const lignes = [
      { mois: '2026-10-01', participantId: 'a', horizon: 600, externe: 0 },
      { mois: '2026-10-01', participantId: 'b', horizon: 300, externe: 0 },
      { mois: '2026-10-01', participantId: 'c', horizon: 100, externe: 0 },
    ];
    const r = sourcesCA(lignes, [{ id: 'a', structureId: 's1' }, { id: 'b', structureId: 's1' }, { id: 'c' }], [{ id: 's1', nom: 'Résidence' }]);
    expect(r).toEqual([
      { cle: 's1', libelle: 'Résidence', montant: 900, part: 90, beneficiaires: 2 },
      { cle: 'particuliers', libelle: 'Particuliers', montant: 100, part: 10, beneficiaires: 1 },
    ]);
    expect(partPremierBeneficiaire(lignes)).toBe(60);
  });
  it('rend une liste vide sans CA', () => {
    expect(sourcesCA([], [], [])).toEqual([]);
    expect(partPremierBeneficiaire([])).toBeNull();
  });
});

describe('portefeuille', () => {
  it('compte actifs, arrivées, départs et ancienneté', () => {
    const r = portefeuille([
      { participantId: 'a', statut: 'actif', dateDebut: '2025-11-24', dateFin: '2026-12-31' },
      { participantId: 'b', statut: 'actif', dateDebut: '2026-10-01', dateFin: '2026-12-31' },
      { participantId: 'c', statut: 'termine', dateDebut: '2026-01-01', dateFin: '2026-10-15' },
      { participantId: 'd', statut: 'termine', dateDebut: '2025-01-01', dateFin: '2025-06-01' },
      { participantId: 'd', statut: 'a_venir', dateDebut: '2026-12-01', dateFin: '2027-06-01' },
    ], JOUR);
    expect(r).toEqual({ actifs: 2, arrivees: 1, departs: 1, ancienneteMois: 7 });
  });
});

describe('parStructure', () => {
  it('rend une ligne par structure et une pour les particuliers', () => {
    const r = parStructure({
      structures: [{ id: 's1', nom: 'Résidence' }],
      suivis: [{ id: 'a', structureId: 's1' }, { id: 'c' }],
      participants: [{ id: 'a', structureId: 's1' }, { id: 'c' }],
      seances: [s('2026-11-10', 'realisee', 'a', { dureeMinutes: 60 }), s('2026-11-12', 'annulee', 'a'), s('2026-11-11', 'realisee', 'c', { dureeMinutes: 45 })],
      cours: [{ date: '2026-11-05', statut: 'realise', dureeMinutes: 60, structureId: 's1' }],
      lignes: [{ mois: '2026-10-01', participantId: 'a', horizon: 200, externe: 0 }],
      aujourdhui: JOUR,
    });
    expect(r).toEqual([
      { cle: 's1', libelle: 'Résidence', beneficiaires: 1, minutesMois: 120, coursMois: 1, presence: 50, ca12Mois: 200 },
      { cle: 'particuliers', libelle: 'Particuliers', beneficiaires: 1, minutesMois: 45, coursMois: 0, presence: 100, ca12Mois: 0 },
    ]);
  });
});

describe('assiduiteParBeneficiaire', () => {
  it('classe du moins assidu au plus assidu et ignore les petits effectifs', () => {
    const r = assiduiteParBeneficiaire([
      s('2026-11-01', 'realisee', 'a'), s('2026-11-02', 'annulee', 'a'), s('2026-11-03', 'annulee', 'a'),
      s('2026-11-01', 'realisee', 'b'), s('2026-11-02', 'realisee', 'b'), s('2026-11-03', 'realisee', 'b'),
      s('2026-11-01', 'annulee', 'c'), s('2026-11-30', 'planifiee', 'c'),
    ], JOUR);
    expect(r.map(x => [x.participantId, x.taux])).toEqual([['a', 33], ['b', 100]]);
  });
});

describe('resultatsParTest', () => {
  it('classe progrès, stabilité et recul en unités du test, TUG à l’envers', () => {
    const r = resultatsParTest([
      { bilans: [bilan('2026-01-01', { tug3m: 12 }), bilan('2026-04-01', { tug3m: 9 })] },
      { bilans: [bilan('2026-04-01', { tug3m: 10.5 }), bilan('2026-01-01', { tug3m: 10 })] },
      { bilans: [bilan('2026-01-01', { tug3m: 8 }), bilan('2026-04-01', { tug3m: 10 })] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cle: 'tug', progressent: 1, stables: 1, reculent: 1, total: 3 });
  });
  it('accepte une souplesse négative (pas de pourcentage)', () => {
    const r = resultatsParTest([
      { bilans: [bilan('2026-01-01', { souplesse: { methode: 'debout', valeur: -10 } }), bilan('2026-04-01', { souplesse: { methode: 'debout', valeur: 0 } })] },
    ]);
    expect(r[0]).toMatchObject({ cle: 'souplesse', progressent: 1 });
  });
  it('omet les tests sans bénéficiaire comparable', () => {
    expect(resultatsParTest([{ bilans: [bilan('2026-01-01', { tug3m: 10 })] }])).toEqual([]);
  });
});

describe('phrasesDuMois', () => {
  // toLocaleString('fr-FR') sépare les milliers par une espace fine insécable.
  const lire = (p: string[]) => p.map(x => x.replace(/\u202f/g, ' '));
  const base = { mois: 'novembre', minutes: 600, minutesMoisPrecedent: 500, realise: 2560, objectif: 4000, presence: 91, progressent: 3, arrivees: 1 };
  it('raconte un bon mois', () => {
    expect(lire(phrasesDuMois(base))).toEqual([
      'Novembre avance bien : 10 h de séance et 2 560 € déjà réalisés, soit 64 % de votre objectif.',
      'Vos bénéficiaires sont fidèles au rendez-vous : 91 % de présence sur 30 jours.',
      '3 bénéficiaires ont progressé à leur dernier bilan, et 1 nouvelle personne vous a rejoint en 3 mois.',
    ]);
  });
  it('dit une baisse avec une piste, sans objectif ni progrès', () => {
    expect(lire(phrasesDuMois({ ...base, minutesMoisPrecedent: 900, objectif: 0, presence: 70, progressent: 0, arrivees: 0 }))).toEqual([
      'Novembre est un peu plus calme que le mois dernier : 10 h de séance et 2 560 € déjà réalisés.',
      'La présence a baissé (70 % sur 30 jours) : un petit message aux absents aide souvent à renouer.',
    ]);
  });
  it('accueille un mois qui commence', () => {
    expect(phrasesDuMois({ ...base, minutes: 0, presence: null, progressent: 0, arrivees: 0 }))
      .toEqual(['Novembre commence : vos premières séances vont s’afficher ici.']);
  });
});
