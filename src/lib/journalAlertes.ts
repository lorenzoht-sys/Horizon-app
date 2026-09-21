import type { CompteRenduSeance } from '../types/seance';
import type { NoteSeance } from '../types';
import type { EntreeCours } from './coursCollectifs';

export type JournalEntry =
  | { type: 'dictee'; date: string; data: CompteRenduSeance }
  | { type: 'note'; date: string; data: NoteSeance }
  // Un cours collectif RÉALISÉ auquel le bénéficiaire était inscrit (présent, absent
  // ou excusé), avec sa participation : effort perçu, bien-être, note du praticien.
  | { type: 'cours'; date: string; data: EntreeCours };

/** Clé stable d'une entrée (les trois types n'ont pas la même forme d'identifiant). */
export function cleEntree(entry: JournalEntry): string {
  return entry.type === 'cours' ? `cours-${entry.data.participation.id}` : entry.data.id;
}

// Détermine si une entrée du journal mérite le point d'alerte visible en
// vue repliée — sans ça, il faudrait déplier chaque carte pour savoir s'il
// y a quelque chose à surveiller.
export function entreeAUneAlerte(entry: JournalEntry): boolean {
  if (entry.type === 'dictee') {
    return Boolean(entry.data.pointsAttention) || Boolean(entry.data.douleursSignalees);
  }
  // Un cours n'a pas d'alerte structurée (douleur, fatigue…) : sa note est du texte libre,
  // que rien ne permet de classer « à surveiller » sans la deviner.
  if (entry.type === 'cours') return false;
  const a = entry.data.alertes;
  return Boolean(a?.douleurSignalee || a?.fatiguePlusQueHabitude || a?.progressionNotable || a?.pointARevoir);
}
