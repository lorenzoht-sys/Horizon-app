import type { CompteRenduSeance } from '../types/seance';
import type { NoteSeance } from '../types';

export type JournalEntry =
  | { type: 'dictee'; date: string; data: CompteRenduSeance }
  | { type: 'note'; date: string; data: NoteSeance };

// Détermine si une entrée du journal mérite le point d'alerte visible en
// vue repliée — sans ça, il faudrait déplier chaque carte pour savoir s'il
// y a quelque chose à surveiller.
export function entreeAUneAlerte(entry: JournalEntry): boolean {
  if (entry.type === 'dictee') {
    return Boolean(entry.data.pointsAttention) || Boolean(entry.data.douleursSignalees);
  }
  const a = entry.data.alertes;
  return Boolean(a?.douleurSignalee || a?.fatiguePlusQueHabitude || a?.progressionNotable || a?.pointARevoir);
}
