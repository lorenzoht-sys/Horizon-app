// ── Logique pure du déplacement/édition/suppression manuelle d'une séance ────
// Extrait de PlanningGrilleView.tsx pour être testable sans rendu React : ces
// fonctions ne font AUCUN appel réseau, elles calculent seulement un plan
// d'opérations (update/delete) à exécuter. Par construction du type
// OperationSeance, une création (insert) est structurellement impossible à
// produire depuis ce module — la garantie « jamais d'INSERT » est donc
// vérifiable à la lecture du type, pas seulement par test.
import type { Seance } from '../types';
import { addMinutes, dateDansMemeSemaine, trouveChevauchement, trouverSerieRecurrente } from '../utils/horaires';
import type { DragPayload } from '../components/planning/FrisePlanningJour';

// Discrimine le geste au drop — glisser un bénéficiaire (création) glisser
// une séance déjà posée (déplacement). Extrait en fonction pure pour être
// couvert par un test dédié : c'est le seul point qui décide si un drop doit
// finir en création (bulkCreerSeances, via la modale de confirmation) ou en
// déplacement (planDeplacerUnique/planDeplacerSerie, jamais de création).
export function estDeplacementExistant(payload: DragPayload): payload is { type: 'existante'; seanceId: string } {
  return payload.type === 'existante';
}

export interface MiseAJourSeance {
  date: string;
  heureDebut: string;
  heureFin: string;
  dureeMinutes: number;
  statut: Seance['statut'];
}

export type OperationSeance =
  | { type: 'update'; id: string; updates: Partial<Seance> }
  | { type: 'delete'; id: string };

export interface ConflitPlan {
  date: string;
  occupePar: string; // participantId de la séance déjà en place
}

export type PlanSerie =
  | { ok: true; operations: OperationSeance[] }
  | { ok: false; conflits: ConflitPlan[] };

// Toutes les occurrences futures (celle-ci incluse) du même créneau récurrent
// que `reference` — jamais l'historique (date < reference.date).
export function calculerFutures(seances: Seance[], reference: Seance): Seance[] {
  return trouverSerieRecurrente(seances, reference).filter(m => m.date >= reference.date);
}

export function estDeplacementNoop(seance: Seance, nouvelleDate: string, heureDebut: string, heureFin: string): boolean {
  return nouvelleDate === seance.date && heureDebut === seance.heureDebut && heureFin === seance.heureFin;
}

// ── Déplacement ───────────────────────────────────────────────────────────────

export function planDeplacerUnique(seance: Seance, nouvelleDate: string, heureDebut: string, heureFin: string): OperationSeance {
  return { type: 'update', id: seance.id, updates: { date: nouvelleDate, heureDebut, heureFin } };
}

// Déplace toutes les `futures` vers le jour de la semaine `dowCible`, chacune
// dans SA PROPRE semaine d'origine (jamais la même date pour toutes — voir
// dateDansMemeSemaine). heureFin recalculée sur la durée propre de chaque
// occurrence (pas celle de l'occurrence glissée), au cas où elles diffèrent
// déjà. Vérifie tous les conflits AVANT de renvoyer la moindre opération :
// si une seule semaine bloque, aucune opération n'est renvoyée (tout ou rien).
export function planDeplacerSerie(
  seances: Seance[],
  futures: Seance[],
  dowCible: number,
  heureDebut: string,
): PlanSerie {
  const idsSerie = new Set(futures.map(f => f.id));
  const autresSeances = seances.filter(s => !idsSerie.has(s.id));

  const cibles = futures.map(f => {
    const date = dateDansMemeSemaine(f.date, dowCible);
    const heureFin = addMinutes(heureDebut, f.dureeMinutes);
    return { id: f.id, date, heureDebut, heureFin };
  });

  const conflits = cibles
    .map(c => ({ c, conflit: trouveChevauchement(autresSeances, { date: c.date, heureDebut: c.heureDebut, heureFin: c.heureFin }) }))
    .filter((x): x is { c: typeof cibles[number]; conflit: Seance } => !!x.conflit);

  if (conflits.length > 0) {
    return { ok: false, conflits: conflits.map(({ c, conflit }) => ({ date: c.date, occupePar: conflit.participantId })) };
  }

  return {
    ok: true,
    operations: cibles.map(c => ({ type: 'update', id: c.id, updates: { date: c.date, heureDebut: c.heureDebut, heureFin: c.heureFin } })),
  };
}

// ── Édition ───────────────────────────────────────────────────────────────────

export function planEditerUnique(seance: Seance, updates: MiseAJourSeance): OperationSeance {
  return { type: 'update', id: seance.id, updates };
}

// Comme planDeplacerSerie, mais applique aussi durée/statut uniformément (une
// édition manuelle porte explicitement sur ces champs, contrairement à un
// simple déplacement qui ne doit toucher que jour/heure).
export function planEditerSerie(
  seances: Seance[],
  futures: Seance[],
  dowCible: number,
  updates: MiseAJourSeance,
): PlanSerie {
  const idsSerie = new Set(futures.map(f => f.id));
  const autresSeances = seances.filter(s => !idsSerie.has(s.id));

  const cibles = futures.map(f => ({ id: f.id, date: dateDansMemeSemaine(f.date, dowCible) }));

  const conflits = cibles
    .map(c => ({ c, conflit: trouveChevauchement(autresSeances, { date: c.date, heureDebut: updates.heureDebut, heureFin: updates.heureFin }) }))
    .filter((x): x is { c: typeof cibles[number]; conflit: Seance } => !!x.conflit);

  if (conflits.length > 0) {
    return { ok: false, conflits: conflits.map(({ c, conflit }) => ({ date: c.date, occupePar: conflit.participantId })) };
  }

  return {
    ok: true,
    operations: cibles.map(c => ({
      type: 'update',
      id: c.id,
      updates: { date: c.date, heureDebut: updates.heureDebut, heureFin: updates.heureFin, dureeMinutes: updates.dureeMinutes, statut: updates.statut },
    })),
  };
}

// ── Suppression ────────────────────────────────────────────────────────────────

export function planSupprimerUnique(seance: Seance): OperationSeance {
  return { type: 'delete', id: seance.id };
}

export function planSupprimerSerie(futures: Seance[]): OperationSeance[] {
  return futures.map(f => ({ type: 'delete', id: f.id }));
}

// ── Exécution ──────────────────────────────────────────────────────────────────
// Seul point d'écriture : boucle sur des opérations déjà décidées. Ne peut
// structurellement pas créer de ligne (le type OperationSeance n'a pas de
// variante 'create', et cette fonction ne reçoit même pas de fonction de
// création en paramètre).
export async function executerOperations(
  operations: OperationSeance[],
  modifierSeance: (id: string, updates: Partial<Seance>) => Promise<boolean>,
  supprimerSeance: (id: string) => Promise<void>,
): Promise<number> {
  await Promise.all(operations.map(op =>
    op.type === 'update' ? modifierSeance(op.id, op.updates) : supprimerSeance(op.id)
  ));
  return operations.length;
}
