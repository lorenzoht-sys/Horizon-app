/**
 * Découpe une liste en lots de taille fixe.
 *
 * Sert aux filtres `.in('colonne', ids)` : PostgREST reçoit la liste dans
 * l'URL, et au-delà de quelques centaines d'identifiants la requête est
 * refusée (erreur 400, URL trop longue). On interroge donc par lots.
 */
export const TAILLE_LOT_IDS = 100;

export function enLots<T>(elements: readonly T[], taille: number = TAILLE_LOT_IDS): T[][] {
  if (!Number.isInteger(taille) || taille < 1) throw new Error('enLots : taille invalide');
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}
