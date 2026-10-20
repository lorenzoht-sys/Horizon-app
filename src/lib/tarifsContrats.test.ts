import { describe, it, expect } from 'vitest';
import { dateCivileParis, jourPrecedent, messageErreurTarif, planChangementTarif, trouverTarifApplicable, totalFactureSeance } from './tarifsContrats';
import type { TarifContrat } from '../types';

function version(overrides: Partial<TarifContrat> = {}): TarifContrat {
  return {
    id: 'v1',
    contratId: 'c1',
    tarifSeance: 40,
    fraisDeplacement: 0,
    dateDebutValidite: '2026-01-01',
    dateFinValidite: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('trouverTarifApplicable', () => {
  it('renvoie la bonne version parmi plusieurs versions successives', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v3', tarifSeance: 50, dateDebutValidite: '2026-06-01', dateFinValidite: undefined }),
      version({ id: 'v2', tarifSeance: 45, dateDebutValidite: '2026-03-01', dateFinValidite: '2026-05-31' }),
      version({ id: 'v1', tarifSeance: 40, dateDebutValidite: '2026-01-01', dateFinValidite: '2026-02-28' }),
    ];

    expect(trouverTarifApplicable(versions, '2026-01-15')?.id).toBe('v1');
    expect(trouverTarifApplicable(versions, '2026-04-10')?.id).toBe('v2');
    expect(trouverTarifApplicable(versions, '2026-08-01')?.id).toBe('v3');
  });

  it('renvoie null pour une séance antérieure à toute version connue', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v1', dateDebutValidite: '2026-03-01', dateFinValidite: undefined }),
    ];

    expect(trouverTarifApplicable(versions, '2026-01-01')).toBeNull();
  });

  it('renvoie null pour une séance postérieure à la dernière version quand celle-ci est close (trou dans l\'historique)', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v1', dateDebutValidite: '2026-01-01', dateFinValidite: '2026-03-31' }),
    ];

    expect(trouverTarifApplicable(versions, '2026-04-15')).toBeNull();
  });

  it('couvre indéfiniment le futur quand la dernière version est ouverte (dateFinValidite undefined)', () => {
    const versions: TarifContrat[] = [
      version({ id: 'v1', dateDebutValidite: '2026-01-01', dateFinValidite: undefined }),
    ];

    expect(trouverTarifApplicable(versions, '2099-01-01')?.id).toBe('v1');
  });

  it('résout correctement un changement de tarif au milieu d\'un mois, avec des séances des deux côtés', () => {
    const versions: TarifContrat[] = [
      version({ id: 'ancien', tarifSeance: 40, dateDebutValidite: '2026-01-01', dateFinValidite: '2026-06-14' }),
      version({ id: 'nouveau', tarifSeance: 48, dateDebutValidite: '2026-06-15', dateFinValidite: undefined }),
    ];

    // Séance avant le changement, dans le mois.
    expect(trouverTarifApplicable(versions, '2026-06-10')?.id).toBe('ancien');
    // Séance le jour même du changement.
    expect(trouverTarifApplicable(versions, '2026-06-15')?.id).toBe('nouveau');
    // Séance après le changement, même mois.
    expect(trouverTarifApplicable(versions, '2026-06-20')?.id).toBe('nouveau');
  });

  it('ne suppose pas que la liste est triée', () => {
    const versions: TarifContrat[] = [
      version({ id: 'recent', dateDebutValidite: '2026-06-01', dateFinValidite: undefined }),
      version({ id: 'ancien', dateDebutValidite: '2026-01-01', dateFinValidite: '2026-05-31' }),
    ];

    expect(trouverTarifApplicable(versions, '2026-02-01')?.id).toBe('ancien');
  });

  it('renvoie null quand aucune version n\'existe', () => {
    expect(trouverTarifApplicable([], '2026-01-01')).toBeNull();
  });
});

describe('totalFactureSeance', () => {
  it('additionne le tarif de séance et les frais de déplacement', () => {
    expect(totalFactureSeance(version({ tarifSeance: 40, fraisDeplacement: 5 }))).toBe(45);
  });

  it('renvoie le tarif de séance seul quand il n\'y a pas de frais de déplacement', () => {
    expect(totalFactureSeance(version({ tarifSeance: 40, fraisDeplacement: 0 }))).toBe(40);
  });
});

describe('changement de tarif : date d\'effet choisie, dates en heure de Paris', () => {
  const v = (id: string, debut: string, fin?: string, tarif = 50): TarifContrat =>
    ({ id, contratId: 'c', tarifSeance: tarif, fraisDeplacement: 0, dateDebutValidite: debut, dateFinValidite: fin } as TarifContrat);

  it('hausse saisie le 5 octobre avec effet au 1er : l\'ancienne version est close au 30 septembre, les séances du 1er au 4 passent au nouveau tarif', () => {
    const actuelle = v('a', '2026-01-01');
    const plan = planChangementTarif(actuelle, '2026-10-01');
    expect(plan).toEqual({ fermer: { id: 'a', dateFin: '2026-09-30' }, remplacer: null, dateDebut: '2026-10-01' });
    const apres = [v('a', '2026-01-01', '2026-09-30', 50), v('b', '2026-10-01', undefined, 55)];
    expect(trouverTarifApplicable(apres, '2026-09-30')?.tarifSeance).toBe(50);   // septembre reste à 50
    for (const j of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) {
      expect(trouverTarifApplicable(apres, j)?.tarifSeance, j).toBe(55);
    }
  });

  it('saisie entre minuit et 2 h à Paris : « aujourd\'hui » est bien le jour de Paris, pas la veille UTC', () => {
    const minuitTrente = new Date('2026-10-04T22:30:00Z');   // 00:30 le 5 octobre à Paris (heure d'été)
    expect(minuitTrente.toISOString().slice(0, 10)).toBe('2026-10-04');   // ce que faisait l'ancien code
    expect(dateCivileParis(minuitTrente)).toBe('2026-10-05');
    const uneHeureCinquante = new Date('2026-10-04T23:50:00Z');
    expect(dateCivileParis(uneHeureCinquante)).toBe('2026-10-05');
    // En hiver (UTC+1) : 00:30 le 15 janvier à Paris = 23:30 UTC le 14.
    expect(dateCivileParis(new Date('2027-01-14T23:30:00Z'))).toBe('2027-01-15');
    // Une saisie à cette heure-là avec la date par défaut ouvre bien la version au 5, close l'ancienne au 4.
    expect(planChangementTarif(v('a', '2026-01-01'), dateCivileParis(minuitTrente)))
      .toEqual({ fermer: { id: 'a', dateFin: '2026-10-04' }, remplacer: null, dateDebut: '2026-10-05' });
  });

  it('veille calculée sans fuseau horaire, y compris aux changements de mois, d\'année et d\'heure', () => {
    expect(jourPrecedent('2026-10-01')).toBe('2026-09-30');
    expect(jourPrecedent('2027-01-01')).toBe('2026-12-31');
    expect(jourPrecedent('2028-03-01')).toBe('2028-02-29');
    expect(jourPrecedent('2026-10-26')).toBe('2026-10-25');   // lendemain du passage à l'heure d'hiver
  });

  it('même jour que le début de la version en vigueur : remplacement, pas de période invalide', () => {
    expect(planChangementTarif(v('a', '2026-10-20'), '2026-10-20')).toEqual({ fermer: null, remplacer: 'a', dateDebut: '2026-10-20' });
  });

  it('date d\'effet antérieure au début du tarif en vigueur : refusée, l\'historique ne se réécrit pas', () => {
    const plan = planChangementTarif(v('a', '2026-10-01'), '2026-09-15');
    expect(plan).toEqual({ erreur: 'La date d\'effet ne peut pas précéder le début du tarif en vigueur (01/10/2026)' });
  });

  it('premier tarif d\'un contrat : simple création à la date choisie ; date mal formée refusée', () => {
    expect(planChangementTarif(null, '2026-11-01')).toEqual({ fermer: null, remplacer: null, dateDebut: '2026-11-01' });
    expect(planChangementTarif(null, '01/11/2026')).toEqual({ erreur: 'Date d\'effet invalide' });
  });

  it('les refus de la base pour une version verrouillée par une facture validée deviennent une phrase utile', () => {
    expect(messageErreurTarif('Version de tarif utilisée par une facture émise : seule sa clôture, après la dernière séance facturée, est permise'))
      .toMatch(/postérieure à la dernière séance facturée/);
    expect(messageErreurTarif('autre erreur')).toBe('autre erreur');
  });
});
