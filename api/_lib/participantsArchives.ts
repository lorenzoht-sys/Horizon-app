// api/_lib/participantsArchives.ts
//
// Bénéficiaires ARCHIVÉS (participants.archive = true) : ils ne sont plus suivis. Les
// traitements automatiques — rappels push et renouvellement des contrats — ne doivent
// pas agir pour eux. Cela ne touche ni au contrat ni aux séances déjà planifiées :
// l'archivage et la fin d'un contrat sont deux décisions distinctes (le contrat garde
// son statut, et un bénéficiaire désarchivé reprend sans réparation).
//
// Choix de conception :
//   - Un contrôle explicite par identifiants, en amont de l'action, plutôt qu'une
//     jointure SQL : exact quel que soit le nombre d'archivés (pas de plafond de
//     lignes), et testable sans base (voir participantsArchives.test.ts).
//   - Par lots de 100 identifiants : une liste `in (...)` trop longue dépasse la
//     limite de taille d'URL de l'API REST.
//   - Si la lecture échoue, on LÈVE : la tâche de cron est alors marquée en erreur
//     (réponse 207, voir api/_lib/cronTaches.ts) et n'envoie rien. Ne pas savoir qui est
//     archivé ne doit jamais revenir à « personne n'est archivé » — ce serait rétablir
//     exactement le comportement qu'on corrige.

import type { SupabaseClient } from '@supabase/supabase-js';

const TAILLE_LOT = 100;

/** Sous-ensemble de `participantIds` dont l'archivage est actif. */
export async function chargerIdsParticipantsArchives(
  supabase: SupabaseClient,
  participantIds: readonly string[],
): Promise<Set<string>> {
  const uniques = [...new Set(participantIds)];
  const archives = new Set<string>();

  for (let i = 0; i < uniques.length; i += TAILLE_LOT) {
    const lot = uniques.slice(i, i + TAILLE_LOT);
    const { data, error } = await supabase
      .from('participants')
      .select('id')
      .in('id', lot)
      .eq('archive', true);
    if (error) {
      throw new Error(`Lecture de l'état d'archivage des bénéficiaires impossible : ${error.message}`);
    }
    for (const ligne of data ?? []) archives.add((ligne as { id: string }).id);
  }

  return archives;
}

/** Retire les éléments (séances, contrats…) dont le bénéficiaire est archivé. */
export function exclureBeneficiairesArchives<T extends { participant_id: string }>(
  elements: readonly T[],
  archives: ReadonlySet<string>,
): T[] {
  return elements.filter(e => !archives.has(e.participant_id));
}
