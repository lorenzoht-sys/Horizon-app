// Orchestration pure du partage d'un document (bénéficiaire ou structure)
// depuis "Mon assistant" — extrait pour être testable sans monter le
// composant React. Ne décide PAS des effets UI (toast, fermeture de modale) :
// se contente de dire si l'insert a réussi et quel message afficher, pour que
// l'appelant (AssistantPage.tsx) ne ferme la modale de relecture qu'en cas de
// succès — sinon le texte édité serait perdu si l'utilisateur doit réessayer.

export interface ResultatPartage {
  succes: boolean;
  message: string;
}

export async function partagerDocument(
  // PromiseLike (pas Promise) : le client Supabase renvoie un
  // PostgrestFilterBuilder thenable, pas une Promise nominale.
  insert: () => PromiseLike<{ error: unknown }>,
  messageSucces: string,
  messageErreur = 'Erreur lors du partage',
): Promise<ResultatPartage> {
  const { error } = await insert();
  return error
    ? { succes: false, message: messageErreur }
    : { succes: true, message: messageSucces };
}
