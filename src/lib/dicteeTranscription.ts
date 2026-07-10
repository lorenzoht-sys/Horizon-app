// Résout le texte à envoyer à l'analyse IA à l'arrêt d'une dictée.
//
// Sur Android Chrome, si l'utilisateur arrête l'enregistrement juste après
// avoir parlé, le moteur de reconnaissance n'a parfois pas eu le temps de
// marquer le dernier segment comme définitif (isFinal: true) : finalTranscript
// reste vide alors que le texte était déjà visible à l'écran en tant
// qu'interimTranscript. Plutôt que de perdre ce texte silencieusement, on
// l'utilise en repli.

export interface ResultatTranscription {
  texte: string | null;
  aUtiliseSecoursInterim: boolean;
}

export function resoudreTranscriptionFinale(
  finalTranscript: string,
  interimTranscript: string
): ResultatTranscription {
  const texte = finalTranscript.trim();
  if (texte) return { texte, aUtiliseSecoursInterim: false };

  const secours = interimTranscript.trim();
  if (secours) return { texte: secours, aUtiliseSecoursInterim: true };

  return { texte: null, aUtiliseSecoursInterim: false };
}
