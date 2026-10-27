// Suggestion de reformulation bienveillante pour un texte libre destiné au
// bénéficiaire (bilan.messageClient, programme.messageMotivation, contenu
// partagé via ModalRelecturePartage). Toujours une SUGGESTION à valider par
// le praticien — cette fonction ne modifie jamais rien elle-même, elle
// retourne juste un texte candidat que l'appelant applique (ou non) sur clic
// explicite. Voir formulationBienveillante.ts pour la reformulation
// automatique des libellés à seuils (mécanisme différent, sans IA).

import { getAuthHeader } from '../lib/supabase';
import { CONSIGNE_MARQUEURS, masquerIdentiteConnue, reinsererIdentite, type IdentiteBeneficiaire } from './pseudonymiserIA';

/** `identite` : bénéficiaire concerné, quand l'appelant le connaît. Les textes
 *  à reformuler sont souvent eux-mêmes générés (« Bonjour Jeanne, … ») : son
 *  nom connu est masqué avant l'envoi et réinséré au retour (aller-retour
 *  sans perte, voir pseudonymiserIA.ts). */
export async function suggererReformulation(texte: string, identite?: IdentiteBeneficiaire | null): Promise<string> {
  const prompt = `Reformule le texte suivant pour qu'il reste motivant et bienveillant pour un bénéficiaire, sans changer le sens clinique et sans inventer d'information absente du texte d'origine. Réponds uniquement avec le texte reformulé, sans commentaire, sans guillemets, sans préambule.
${identite ? `\n${CONSIGNE_MARQUEURS}\n` : ''}
Texte à reformuler :
${masquerIdentiteConnue(texte, identite)}`;

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ prompt, model: 'claude-haiku-4-5-20251001' }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Erreur API Claude (${response.status}): ${err}`);
  }

  const data = await response.json();
  const texteReformule: string = reinsererIdentite((data.text ?? '').trim(), identite);
  if (!texteReformule) {
    throw new Error('Réponse vide de l\'IA');
  }
  return texteReformule;
}
