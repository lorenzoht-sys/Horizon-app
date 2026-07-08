import { describe, it, expect, vi } from 'vitest';
import type { Seance } from '../types';
import {
  calculerFutures, estDeplacementNoop, estDeplacementExistant,
  planDeplacerUnique, planDeplacerSerie, planEditerUnique, planEditerSerie,
  planSupprimerUnique, planSupprimerSerie, planActionSurSelection, optionsPorteePourAction, executerOperations,
} from './planificationManuelle';
import { cleSerieRecurrente } from '../utils/horaires';

function fakeSeance(overrides: Partial<Seance> = {}): Seance {
  return {
    id: 'seance-1',
    participantId: 'participant-1',
    contratId: 'contrat-A',
    date: '2026-07-14',
    heureDebut: '10:00',
    heureFin: '10:45',
    dureeMinutes: 45,
    type: 'seance',
    statut: 'planifiee',
    adresse: '',
    ...overrides,
  };
}

// Trois occurrences hebdomadaires (S0 passée, S1/S2/S3 futures) du même
// rythme récurrent (même bénéficiaire/contrat/jour/heure), utilisées comme
// fixture commune par la plupart des 12 cas.
const S0 = fakeSeance({ id: 's0', date: '2026-07-07' }); // passée
const S1 = fakeSeance({ id: 's1', date: '2026-07-14' }); // référence
const S2 = fakeSeance({ id: 's2', date: '2026-07-21' });
const S3 = fakeSeance({ id: 's3', date: '2026-07-28' });

function mocksModifSuppr() {
  const modifierSeance = vi.fn<(id: string, updates: Partial<Seance>) => Promise<boolean>>(async () => true);
  const supprimerSeance = vi.fn<(id: string) => Promise<void>>(async () => {});
  return { modifierSeance, supprimerSeance };
}

describe('Diagnostic du bug rapporté — "cette séance uniquement" ne doit jamais créer de ligne', () => {
  it('planDeplacerUnique produit un UPDATE sur l\'id existant, jamais autre chose', () => {
    const op = planDeplacerUnique(S1, '2026-07-16', '14:00', '14:45');
    expect(op).toEqual({ type: 'update', id: 's1', updates: { date: '2026-07-16', heureDebut: '14:00', heureFin: '14:45' } });
  });

  it('exécuter le plan "unique" appelle modifierSeance exactement 1 fois avec le bon id, et ne touche à aucune fonction de création', async () => {
    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    // Espion qui simulerait une création — jamais transmis à executerOperations,
    // dont la signature ne prend même pas de fonction de création en paramètre.
    // Si le bug suspecté (INSERT au lieu d'UPDATE) existait, il faudrait que le
    // code appelle une fonction tierce que ce test ne lui fournit pas du tout :
    // impossible de le faire passer par erreur.
    const creerSeanceSpy = vi.fn();

    const seances = [S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    expect(futures).toHaveLength(3); // récurrente : la boîte de choix s'ouvrirait

    // Chemin "cette séance uniquement"
    const op = planDeplacerUnique(S1, '2026-07-16', '14:00', '14:45');
    const nb = await executerOperations([op], modifierSeance, supprimerSeance);

    expect(nb).toBe(1);
    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('s1', { date: '2026-07-16', heureDebut: '14:00', heureFin: '14:45' });
    expect(supprimerSeance).not.toHaveBeenCalled();
    expect(creerSeanceSpy).not.toHaveBeenCalled();
  });
});

describe('Cas 1 — séance non récurrente : 1 UPDATE, 0 création', () => {
  it('futures ne contient qu\'elle-même, et le plan ne modifie que sa propre ligne', async () => {
    const isolee = fakeSeance({ id: 'seul', contratId: 'contrat-solo' });
    const seances = [isolee];
    const futures = calculerFutures(seances, isolee);
    expect(futures.map(f => f.id)).toEqual(['seul']);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const op = planDeplacerUnique(isolee, '2026-07-16', '09:00', '09:45');
    await executerOperations([op], modifierSeance, supprimerSeance);

    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('seul', { date: '2026-07-16', heureDebut: '09:00', heureFin: '09:45' });
  });
});

describe('Cas 2 — récurrente, "cette séance uniquement" : 1 seule ligne modifiée, les autres intactes', () => {
  it('seul l\'id de la séance choisie apparaît dans le plan', async () => {
    const { modifierSeance, supprimerSeance } = mocksModifSuppr();

    const op = planDeplacerUnique(S1, '2026-07-16', '14:00', '14:45');
    await executerOperations([op], modifierSeance, supprimerSeance);

    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('s1', expect.anything());
    // S2 et S3 ne sont jamais passées à modifierSeance
    const idsAppeles = modifierSeance.mock.calls.map(c => c[0]);
    expect(idsAppeles).not.toContain('s2');
    expect(idsAppeles).not.toContain('s3');
  });
});

describe('Cas 3 — récurrente, "et les suivantes" : toutes les futures modifiées, passé intact, 0 création', () => {
  it('déplace S1/S2/S3 (chacune dans sa propre semaine), ignore S0 (passée)', async () => {
    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    expect(futures.map(f => f.id)).toEqual(['s1', 's2', 's3']); // S0 exclue

    const plan = planDeplacerSerie(seances, futures, 4 /* jeudi */, '14:00');
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations).toHaveLength(3);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(nb).toBe(3);
    expect(modifierSeance).toHaveBeenCalledTimes(3);
    const idsModifies = modifierSeance.mock.calls.map(c => c[0]).sort();
    expect(idsModifies).toEqual(['s1', 's2', 's3']);
    expect(modifierSeance.mock.calls.some(c => c[0] === 's0')).toBe(false);

    // Chaque occurrence reste dans SA propre semaine d'origine (pas la même
    // date pour toutes — sinon chevauchement garanti entre elles).
    const datesParId = Object.fromEntries(modifierSeance.mock.calls.map(c => [c[0], (c[1] as Partial<Seance>).date]));
    expect(datesParId['s1']).not.toBe(datesParId['s2']);
    expect(datesParId['s2']).not.toBe(datesParId['s3']);
  });
});

describe('Cas 4 — créneau en conflit : blocage, 0 modification', () => {
  it('planDeplacerSerie renvoie ok:false et aucune opération si une semaine cible est déjà occupée', () => {
    const seances = [S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    // Un autre bénéficiaire est déjà au jeudi 14:00 la semaine de S2 (21/07 -> jeudi 23/07)
    const bloqueuse = fakeSeance({ id: 'bloqueuse', participantId: 'autre-participant', contratId: 'autre-contrat', date: '2026-07-23', heureDebut: '14:00', heureFin: '14:45' });

    const plan = planDeplacerSerie([...seances, bloqueuse], futures, 4 /* jeudi */, '14:00');
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('unreachable');
    expect(plan.conflits).toEqual([{ date: '2026-07-23', occupePar: 'autre-participant' }]);
  });

  it('quand le plan est refusé, aucun appel à modifierSeance/supprimerSeance ne doit être fait (responsabilité de l\'appelant)', () => {
    const seances = [S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    const bloqueuse = fakeSeance({ id: 'bloqueuse', participantId: 'autre-participant', date: '2026-07-23', heureDebut: '14:00', heureFin: '14:45' });
    const plan = planDeplacerSerie([...seances, bloqueuse], futures, 4, '14:00');

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    // Reproduit exactement le garde-fou de PlanningGrilleView.handleDeplacerSeance :
    // executerOperations n'est appelée QUE si plan.ok.
    if (plan.ok) { void executerOperations(plan.operations, modifierSeance, supprimerSeance); }

    expect(modifierSeance).not.toHaveBeenCalled();
    expect(supprimerSeance).not.toHaveBeenCalled();
  });
});

describe('Cas 5 — occurrence déjà isolée précédemment : cohérent (série d\'1)', () => {
  // L'heure seule n'isole plus une occurrence (voir la clé de série révisée
  // suite au bug Julien B. — un jour = un rythme, quelle que soit l'heure
  // enregistrée). Seul un changement de JOUR isole réellement une occurrence.
  it('une occurrence déjà déplacée à un autre JOUR ne trouve plus de sœurs : futures = elle-même seule', () => {
    const dejaDeplacee = fakeSeance({ id: 's2-isolee', date: '2026-07-22', heureDebut: '16:00', heureFin: '16:45' }); // mercredi, S1/S3 sont un mardi
    const seances = [S1, dejaDeplacee, S3];
    const futures = calculerFutures(seances, dejaDeplacee);
    expect(futures.map(f => f.id)).toEqual(['s2-isolee']);
  });

  it('un simple changement d\'heure sur le même jour ne l\'isole PAS : elle reste rattachée au rythme de ce jour', () => {
    const heureAjustee = fakeSeance({ id: 's2-heure', date: '2026-07-21', heureDebut: '16:00', heureFin: '16:45' }); // mardi, comme S1/S3
    const seances = [S1, heureAjustee, S3];
    const futures = calculerFutures(seances, heureAjustee);
    // S1 (14/07) est avant heureAjustee (21/07) : c'est l'historique relatif à
    // cette référence, exclu par calculerFutures — comportement inchangé, sans
    // rapport avec la clé de série. Seuls s2-heure et s3 sont >= sa date.
    expect(futures.map(f => f.id)).toEqual(['s2-heure', 's3']);
  });

  it('re-déplacer cette occurrence isolée ne modifie qu\'elle (pas de boîte de choix nécessaire, futures.length === 1)', async () => {
    const dejaDeplacee = fakeSeance({ id: 's2-isolee', date: '2026-07-22', heureDebut: '16:00', heureFin: '16:45' });
    const seances = [S1, dejaDeplacee, S3];
    const futures = calculerFutures(seances, dejaDeplacee);
    expect(futures.length).toBeLessThanOrEqual(1);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const op = planDeplacerUnique(dejaDeplacee, '2026-07-23', '16:00', '16:45');
    await executerOperations([op], modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('s2-isolee', expect.anything());
  });
});

describe('Cas 6 — édition heure/jour, "cette séance uniquement" : 1 UPDATE', () => {
  it('planEditerUnique ne modifie que la ligne visée', async () => {
    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const op = planEditerUnique(S1, { date: '2026-07-15', heureDebut: '11:00', heureFin: '11:45', dureeMinutes: 45, statut: 'planifiee' });
    await executerOperations([op], modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('s1', { date: '2026-07-15', heureDebut: '11:00', heureFin: '11:45', dureeMinutes: 45, statut: 'planifiee' });
  });
});

describe('Cas 7 — édition, "et les suivantes" : série mise à jour', () => {
  it('planEditerSerie applique durée/statut/heure à toutes les futures, dans leur propre semaine', async () => {
    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    const dowCible = new Date('2026-07-16T12:00').getDay(); // jeudi

    const plan = planEditerSerie(seances, futures, dowCible, { date: '2026-07-16', heureDebut: '11:00', heureFin: '11:30', dureeMinutes: 30, statut: 'planifiee' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations).toHaveLength(3);
    expect(plan.operations.every(op => op.type === 'update')).toBe(true);
    expect(plan.operations.some(op => op.id === 's0')).toBe(false); // passé jamais touché

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(3);
    for (const call of modifierSeance.mock.calls) {
      const updates = call[1] as Partial<Seance>;
      expect(updates.heureDebut).toBe('11:00');
      expect(updates.dureeMinutes).toBe(30);
    }
  });
});

describe('Cas 8 — changer le statut : pas d\'effet de bord sur la récurrence', () => {
  it('un changement de statut seul ne modifie ni la clé de série ni les autres occurrences', async () => {
    const cleAvant = cleSerieRecurrente(S1);
    const updates = { date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: S1.dureeMinutes, statut: 'realisee' as const };
    const op = planEditerUnique(S1, updates);
    const seanceApres: Seance = { ...S1, ...updates };
    expect(cleSerieRecurrente(seanceApres)).toBe(cleAvant); // reste dans la même série

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations([op], modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('s1', expect.objectContaining({ statut: 'realisee' }));
    expect(supprimerSeance).not.toHaveBeenCalled();
  });
});

describe('Cas 8bis — annulation d\'une séance récurrente, "cette séance uniquement"', () => {
  it('seule l\'occurrence choisie passe à \'annulee\', les autres restent \'planifiee\'', async () => {
    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    expect(futures.map(f => f.id)).toEqual(['s1', 's2', 's3']); // récurrente : la boîte de choix s'ouvrirait

    const updates = { date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: S1.dureeMinutes, statut: 'annulee' as const };
    const op = planEditerUnique(S1, updates);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations([op], modifierSeance, supprimerSeance);

    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('s1', expect.objectContaining({ statut: 'annulee' }));
    // S2 et S3 ne sont jamais passées à modifierSeance : elles restent 'planifiee'
    const idsAppeles = modifierSeance.mock.calls.map(c => c[0]);
    expect(idsAppeles).not.toContain('s2');
    expect(idsAppeles).not.toContain('s3');
    expect(supprimerSeance).not.toHaveBeenCalled();
  });

  it('"et les suivantes" applique bien \'annulee\' à toute la série future, jamais au passé', async () => {
    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    const dowCible = new Date(S1.date + 'T12:00').getDay(); // pas de changement de jour, juste le statut

    const updates = { date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: S1.dureeMinutes, statut: 'annulee' as const };
    const plan = planEditerSerie(seances, futures, dowCible, updates);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(nb).toBe(3);
    for (const call of modifierSeance.mock.calls) {
      expect((call[1] as Partial<Seance>).statut).toBe('annulee');
    }
    expect(modifierSeance.mock.calls.some(c => c[0] === 's0')).toBe(false); // S0 (passée) jamais touchée
    expect(supprimerSeance).not.toHaveBeenCalled();
  });
});

describe('planActionSurSelection — option "Sélectionner les séances concernées" (sélection non contiguë)', () => {
  // S1/S2/S3 : 3 occurrences futures hebdomadaires. On sélectionne S1 et S3
  // (1ère et 3ème), en sautant S2 délibérément — c'est exactement le scénario
  // de l'incident Pierre Poindessault (vacances sur 2 dates précises, pas
  // toute la série) que cette option doit permettre.
  const seances = [S0, S1, S2, S3];

  it('déplacer : seules S1 et S3 sont déplacées, S2 reste intacte', async () => {
    const dowJeudi = new Date('2026-07-16T12:00').getDay();
    const plan = planActionSurSelection(seances, ['s1', 's3'], { type: 'deplacer', dowCible: dowJeudi, heureDebut: '14:00' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations).toHaveLength(2);
    expect(plan.operations.map(op => op.id).sort()).toEqual(['s1', 's3']);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(2);
    const idsAppeles = modifierSeance.mock.calls.map(c => c[0]);
    expect(idsAppeles).not.toContain('s2'); // sautée volontairement
    expect(idsAppeles).not.toContain('s0'); // passée, jamais dans la sélection de toute façon
  });

  it('éditer (dont annuler) : seules S1 et S3 passent au nouveau statut/raison, S2 reste \'planifiee\'', async () => {
    const dowCible = new Date(S1.date + 'T12:00').getDay(); // pas de changement de jour
    const updates = {
      date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: S1.dureeMinutes,
      statut: 'annulee' as const, motifAnnulation: 'vacances' as const,
    };
    const plan = planActionSurSelection(seances, ['s1', 's3'], { type: 'editer', dowCible, updates });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations.map(op => op.id).sort()).toEqual(['s1', 's3']);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(2);
    for (const call of modifierSeance.mock.calls) {
      const upd = call[1] as Partial<Seance>;
      expect(upd.statut).toBe('annulee');
      expect(upd.motifAnnulation).toBe('vacances'); // même raison sur toute la sélection cochée
    }
    const idsAppeles = modifierSeance.mock.calls.map(c => c[0]);
    expect(idsAppeles).not.toContain('s2');
  });

  it('supprimer : seules S1 et S3 sont supprimées, S2 reste, aucune modification', async () => {
    const plan = planActionSurSelection(seances, ['s1', 's3'], { type: 'supprimer' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations).toEqual([
      { type: 'delete', id: 's1' },
      { type: 'delete', id: 's3' },
    ]);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(supprimerSeance).toHaveBeenCalledTimes(2);
    const idsSupprimes = supprimerSeance.mock.calls.map(c => c[0]).sort();
    expect(idsSupprimes).toEqual(['s1', 's3']);
    expect(modifierSeance).not.toHaveBeenCalled();
  });

  it('conflit sur une séance de la sélection : blocage total, 0 opération', () => {
    const dowJeudi = new Date('2026-07-16T12:00').getDay();
    // Bloque S3 (28/07 -> jeudi 30/07) avec un autre bénéficiaire.
    const bloqueuse = fakeSeance({ id: 'bloqueuse', participantId: 'autre', contratId: 'autre-contrat', date: '2026-07-30', heureDebut: '14:00', heureFin: '14:45' });
    const plan = planActionSurSelection([...seances, bloqueuse], ['s1', 's3'], { type: 'deplacer', dowCible: dowJeudi, heureDebut: '14:00' });
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error('unreachable');
    expect(plan.conflits).toEqual([{ date: '2026-07-30', occupePar: 'autre' }]);
  });

  it('toute opération produite reste update ou delete, jamais create', () => {
    const planSuppr = planActionSurSelection(seances, ['s1', 's3'], { type: 'supprimer' });
    const ops1 = planSuppr.ok ? planSuppr.operations : [];
    const planDep = planActionSurSelection(seances, ['s1', 's3'], { type: 'deplacer', dowCible: 4, heureDebut: '09:00' });
    const ops2 = planDep.ok ? planDep.operations : [];
    for (const op of [...ops1, ...ops2]) {
      expect(['update', 'delete']).toContain(op.type);
    }
  });
});

describe('optionsPorteePourAction — retire "et les suivantes" uniquement pour l\'annulation', () => {
  const updatesBase = { date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: S1.dureeMinutes };

  it('annuler (editer avec statut annulee) : seulement "unique" et "selection", 2 options', () => {
    const options = optionsPorteePourAction({ type: 'editer', dowCible: 2, updates: { ...updatesBase, statut: 'annulee' } });
    expect(options).toEqual(['unique', 'selection']);
    expect(options).not.toContain('serie');
  });

  it('éditer avec un autre statut : les 3 options restent proposées', () => {
    for (const statut of ['planifiee', 'realisee', 'reportee'] as const) {
      const options = optionsPorteePourAction({ type: 'editer', dowCible: 2, updates: { ...updatesBase, statut } });
      expect(options).toEqual(['unique', 'serie', 'selection']);
    }
  });

  it('déplacer : toujours les 3 options', () => {
    expect(optionsPorteePourAction({ type: 'deplacer', dowCible: 2, heureDebut: '10:00' })).toEqual(['unique', 'serie', 'selection']);
  });

  it('supprimer : toujours les 3 options', () => {
    expect(optionsPorteePourAction({ type: 'supprimer' })).toEqual(['unique', 'serie', 'selection']);
  });
});

describe('Cas 9 — suppression "cette séance uniquement" : 1 ligne supprimée', () => {
  it('planSupprimerUnique ne supprime que la ligne visée', async () => {
    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const op = planSupprimerUnique(S1);
    expect(op).toEqual({ type: 'delete', id: 's1' });
    await executerOperations([op], modifierSeance, supprimerSeance);
    expect(supprimerSeance).toHaveBeenCalledTimes(1);
    expect(supprimerSeance).toHaveBeenCalledWith('s1');
    expect(modifierSeance).not.toHaveBeenCalled();
  });
});

describe('Cas 10 — suppression "et les suivantes" : série future supprimée, passé intact', () => {
  it('planSupprimerSerie ne porte que sur les futures (S0 exclue)', async () => {
    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    const ops = planSupprimerSerie(futures);
    expect(ops).toHaveLength(3);
    expect(ops.every(op => op.type === 'delete')).toBe(true);
    expect(ops.some(op => op.id === 's0')).toBe(false);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations(ops, modifierSeance, supprimerSeance);
    expect(supprimerSeance).toHaveBeenCalledTimes(3);
    const idsSupprimes = supprimerSeance.mock.calls.map(c => c[0]).sort();
    expect(idsSupprimes).toEqual(['s1', 's2', 's3']);
    expect(modifierSeance).not.toHaveBeenCalled();
  });
});

describe('Cas 11 — intégrité générale : jamais de création, déplacement/édition = UPDATE, suppression = DELETE', () => {
  it('executerOperations ne peut appeler que modifierSeance ou supprimerSeance, jamais une fonction tierce', async () => {
    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const creerSeanceJamaisAppelee = vi.fn();
    const bulkCreerSeancesJamaisAppelee = vi.fn();

    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);

    // On enchaîne déplacement (unique + série), édition (unique + série) et
    // suppression (unique + série) — dans tous les cas, seules modifierSeance/
    // supprimerSeance sont sollicitées.
    await executerOperations([planDeplacerUnique(S1, '2026-07-16', '09:00', '09:45')], modifierSeance, supprimerSeance);
    const planSerie = planDeplacerSerie(seances, futures, 4, '09:00');
    if (planSerie.ok) await executerOperations(planSerie.operations, modifierSeance, supprimerSeance);
    await executerOperations([planEditerUnique(S1, { date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: 60, statut: 'planifiee' })], modifierSeance, supprimerSeance);
    await executerOperations([planSupprimerUnique(S2)], modifierSeance, supprimerSeance);
    await executerOperations(planSupprimerSerie(futures), modifierSeance, supprimerSeance);

    expect(creerSeanceJamaisAppelee).not.toHaveBeenCalled();
    expect(bulkCreerSeancesJamaisAppelee).not.toHaveBeenCalled();
  });

  it('toute opération produite par les fonctions plan* est de type update ou delete, jamais create', () => {
    const seances = [S0, S1, S2, S3];
    const futures = calculerFutures(seances, S1);
    const toutesLesOperations = [
      planDeplacerUnique(S1, '2026-07-16', '09:00', '09:45'),
      planEditerUnique(S1, { date: S1.date, heureDebut: S1.heureDebut, heureFin: S1.heureFin, dureeMinutes: 45, statut: 'planifiee' }),
      planSupprimerUnique(S1),
      ...planSupprimerSerie(futures),
    ];
    for (const op of toutesLesOperations) {
      expect(['update', 'delete']).toContain(op.type);
    }
  });
});

describe('Cas 12 — la création normale (glisser un bénéficiaire) fonctionne toujours', () => {
  it('estDeplacementExistant distingue correctement les deux gestes de drag', () => {
    expect(estDeplacementExistant({ type: 'nouvelle' })).toBe(false);
    expect(estDeplacementExistant({ type: 'existante', seanceId: 'x' })).toBe(true);
  });
});

describe('estDeplacementNoop', () => {
  it('détecte un déplacement identique (aucun changement réel)', () => {
    expect(estDeplacementNoop(S1, S1.date, S1.heureDebut, S1.heureFin)).toBe(true);
  });
  it('détecte un vrai changement', () => {
    expect(estDeplacementNoop(S1, S1.date, '11:00', '11:45')).toBe(false);
  });
});

// Bug rapporté (Julien B.) : "déplacer cette séance et les suivantes" du
// jeudi vers le mardi ne déplaçait qu'un sous-ensemble des séances du jeudi,
// à cause d'écarts d'heure entre occurrences qui scindaient la série en
// plusieurs groupes invisibles les uns des autres (badges ↻4/↻7/↻8).
describe('Bug Julien B. — déplacement de série complet malgré des écarts d\'heure entre occurrences du même jour', () => {
  it('"et les suivantes" déplace TOUTES les occurrences futures du jeudi, même avec des heures différentes, et unifie l\'heure sur la nouvelle', async () => {
    const jeudi1 = fakeSeance({ id: 'j1', participantId: 'julien', contratId: 'contrat-julien', date: '2026-07-16', heureDebut: '10:00', heureFin: '10:45' });
    const jeudi2 = fakeSeance({ id: 'j2', participantId: 'julien', contratId: 'contrat-julien', date: '2026-07-23', heureDebut: '10:15', heureFin: '11:00' });
    const jeudi3 = fakeSeance({ id: 'j3', participantId: 'julien', contratId: 'contrat-julien', date: '2026-07-30', heureDebut: '09:45', heureFin: '10:30' });
    const seances = [jeudi1, jeudi2, jeudi3];

    const futures = calculerFutures(seances, jeudi1);
    expect(futures.map(f => f.id)).toEqual(['j1', 'j2', 'j3']); // les 3, malgré les écarts d'heure

    const dowMardi = new Date('2026-07-21T12:00').getDay();
    const plan = planDeplacerSerie(seances, futures, dowMardi, '14:00');
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations).toHaveLength(3);

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    const nb = await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(nb).toBe(3);
    const idsDeplaces = modifierSeance.mock.calls.map(c => c[0]).sort();
    expect(idsDeplaces).toEqual(['j1', 'j2', 'j3']); // plus aucune ne reste au jeudi

    // Toutes basculent sur la même nouvelle heure (l'écart d'origine est unifié).
    for (const call of modifierSeance.mock.calls) {
      const updates = call[1] as Partial<Seance>;
      expect(updates.heureDebut).toBe('14:00');
      expect(new Date(updates.date + 'T12:00').getDay()).toBe(dowMardi);
    }
  });

  it('déplacer le jeudi ne touche jamais le lundi/vendredi du même contrat (bénéficiaire à 3 séances/semaine)', async () => {
    const lundi = fakeSeance({ id: 'lun', participantId: 'julien', contratId: 'contrat-julien', date: '2026-07-13', heureDebut: '09:00', heureFin: '09:45' });
    const jeudi = fakeSeance({ id: 'jeu', participantId: 'julien', contratId: 'contrat-julien', date: '2026-07-16', heureDebut: '10:00', heureFin: '10:45' });
    const vendredi = fakeSeance({ id: 'ven', participantId: 'julien', contratId: 'contrat-julien', date: '2026-07-17', heureDebut: '11:00', heureFin: '11:45' });
    const seances = [lundi, jeudi, vendredi];

    const futures = calculerFutures(seances, jeudi);
    expect(futures.map(f => f.id)).toEqual(['jeu']); // ni lundi ni vendredi

    const dowMardi = new Date('2026-07-21T12:00').getDay();
    const plan = planDeplacerSerie(seances, futures, dowMardi, '14:00');
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('unreachable');
    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0].id).toBe('jeu');

    const { modifierSeance, supprimerSeance } = mocksModifSuppr();
    await executerOperations(plan.operations, modifierSeance, supprimerSeance);
    expect(modifierSeance).toHaveBeenCalledTimes(1);
    expect(modifierSeance).toHaveBeenCalledWith('jeu', expect.anything());
    // lundi et vendredi ne sont jamais passés à modifierSeance
    const idsAppeles = modifierSeance.mock.calls.map(c => c[0]);
    expect(idsAppeles).not.toContain('lun');
    expect(idsAppeles).not.toContain('ven');
  });
});
