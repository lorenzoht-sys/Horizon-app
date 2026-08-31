// Comparaison de secrets partagés, à temps constant.
//
// ── Pourquoi un `!==` ne suffit pas ─────────────────────────────────────
// La comparaison de chaînes de JavaScript s'arrête au PREMIER caractère qui
// diffère. Le temps de réponse dépend donc de la longueur du préfixe déjà
// correct. Un attaquant capable de mesurer ce temps devine alors le secret
// caractère par caractère : le nombre d'essais devient proportionnel à la
// longueur du secret, au lieu d'être exponentiel. C'est la différence entre
// quelques milliers de requêtes et un secret hors d'atteinte.
//
// L'écart est de l'ordre de la nanoseconde, noyé dans le bruit du réseau sur
// un appel isolé — mais il se moyenne sur un grand nombre d'appels, et les
// endpoints concernés sont joignables publiquement.
//
// ── Pourquoi on hache avant de comparer ─────────────────────────────────
// `timingSafeEqual` EXIGE deux buffers de même longueur et lève une exception
// sinon. L'appeler directement sur les secrets remplacerait la fuite du
// préfixe par une fuite de la LONGUEUR, et ferait planter la route sur une
// entrée mal formée — un 500 au lieu d'un 401, ce qui renseigne encore
// l'attaquant.
//
// L'empreinte SHA-256 fait 32 octets quelles que soient les entrées : la
// comparaison est donc toujours légale, et sa durée toujours la même.

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Vrai si les deux secrets sont identiques, en un temps qui ne dépend pas de
 * leur contenu.
 *
 * ATTENTION : deux chaînes vides sont « identiques ». L'appelant doit avoir
 * vérifié AVANT que le secret attendu est bien configuré, sinon une requête
 * sans en-tête serait acceptée sur un environnement mal déployé.
 */
export function secretsIdentiques(fourni: string, attendu: string): boolean {
  const a = createHash('sha256').update(fourni, 'utf8').digest();
  const b = createHash('sha256').update(attendu, 'utf8').digest();
  return timingSafeEqual(a, b);
}
