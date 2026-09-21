// Libellés de l'effort perçu et du bien-être ressenti d'un cours collectif.
//
// Même échelle que retours_seance / EspacePatient.tsx (NIVEAUX_EFFORT,
// NIVEAUX_BIEN_ETRE) : mêmes valeurs et mêmes libellés. Extrait de
// ModalPresenceCoursCollectif pour que la saisie (la modale) et la lecture (fiche
// du bénéficiaire, journal) parlent exactement le même langage.

export interface NiveauRessenti {
  label: string;
  valeur: number;
  couleur: string;
}

export const NIVEAUX_EFFORT: NiveauRessenti[] = [
  { label: 'Très facile', valeur: 2, couleur: '#16A34A' },
  { label: 'Facile', valeur: 4, couleur: '#65A84E' },
  { label: 'Modéré', valeur: 6, couleur: '#CA8A04' },
  { label: 'Difficile', valeur: 8, couleur: '#EA580C' },
  { label: 'Très difficile', valeur: 10, couleur: '#DC2626' },
];

export const NIVEAUX_BIEN_ETRE: NiveauRessenti[] = [
  { label: 'Très bien', valeur: 1, couleur: '#16A34A' },
  { label: 'Bien', valeur: 2, couleur: '#65A84E' },
  { label: 'Correct', valeur: 3, couleur: '#CA8A04' },
  { label: 'Fatigué', valeur: 4, couleur: '#EA580C' },
  { label: 'Épuisé', valeur: 5, couleur: '#DC2626' },
];

/**
 * Niveau correspondant à une valeur en base, ou null si rien n'a été saisi.
 * Une valeur hors échelle (la base accepte 1-10 pour l'effort, alors que la
 * saisie ne propose que 2/4/6/8/10) reste affichable : on ne la masque pas.
 */
function niveau(niveaux: NiveauRessenti[], valeur: number | null | undefined, suffixe: string): NiveauRessenti | null {
  if (valeur == null) return null;
  return niveaux.find(n => n.valeur === valeur) ?? { label: `${valeur}/${suffixe}`, valeur, couleur: '#6B7280' };
}

export function niveauEffort(valeur: number | null | undefined): NiveauRessenti | null {
  return niveau(NIVEAUX_EFFORT, valeur, '10');
}

export function niveauBienEtre(valeur: number | null | undefined): NiveauRessenti | null {
  return niveau(NIVEAUX_BIEN_ETRE, valeur, '5');
}
