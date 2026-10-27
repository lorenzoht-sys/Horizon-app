// Prompt du résumé d'évolution (ComparaisonPage.tsx), extrait de la page pour
// être testé (lot A pseudonymisation, 2026-10-27). La fonction ne reçoit
// aucune identité : le prénom n'est réinséré qu'au retour, dans la page.
import { CONSIGNE_MARQUEURS, LIBELLE_NEUTRE, MARQUEURS, libelleAgeIA } from './pseudonymiserIA';

export function construirePromptResumeEvolution(opts: {
  /** null : date de naissance absente ou invalide (src/lib/age.ts). */
  age: number | null;
  nbMois: number;
  nbBilans: number;
  deltasTexte: string;
}): string {
  const { age, nbMois, nbBilans, deltasTexte } = opts;
  return `Tu es expert en Activité Physique Adaptée (APA). Génère un résumé d'évolution positif et motivant.

Patient : ${LIBELLE_NEUTRE}, ${libelleAgeIA(age)}
Durée de suivi : ${nbMois} mois (${nbBilans} bilans)

Évolution des tests :
${deltasTexte}

${CONSIGNE_MARQUEURS}

Génère :
1. Un résumé professionnel en 3-4 phrases (ton APA, factuel, mentionner les progressions clés)
2. Un message motivant court pour le patient (2 phrases, positif, commencer par "Bravo ${MARQUEURS.prenom},")

Réponds UNIQUEMENT en JSON valide :
{"resumePro":"...","messagePatient":"..."}`;
}
