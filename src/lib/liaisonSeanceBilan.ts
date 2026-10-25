import { supabase } from './supabase';

// Lien agenda → bilan (chantier 15) : « Ouvrir le bilan » depuis une séance de type bilan ouvre le
// formulaire de bilan avec ?seance=<id>. À l'enregistrement du bilan, cette séance passe « réalisée »,
// pour ne pas avoir un agenda d'un côté et des bilans de l'autre sans connexion.

export function idSeanceDepuisRecherche(search: string): string | null {
  const id = new URLSearchParams(search).get('seance');
  return id && /^[0-9a-fA-F-]{36}$/.test(id) ? id : null;
}

/** Ne touche qu'une séance encore « planifiée » : un bilan refait ne rouvre ni n'écrase rien. */
export async function validerSeanceDuBilan(seanceId: string | null, participantId: string): Promise<void> {
  if (!seanceId || !supabase) return;
  const { error } = await supabase
    .from('seances')
    .update({ statut: 'realisee' })
    .eq('id', seanceId)
    .eq('participant_id', participantId)
    .eq('statut', 'planifiee');
  if (error) console.error('Erreur validation de la séance du bilan:', error);
}
