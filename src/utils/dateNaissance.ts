// Saisie au clavier d'une date de naissance (JJ/MM/AAAA), en remplacement de
// <input type="date"> — dont le sélecteur natif impose de défiler année par
// année sur mobile, pénible pour une naissance ancienne (voir docs/PLAN-BETA.md,
// retours de Pierre, point 03). Le format de stockage ne change pas : ISO
// AAAA-MM-JJ, comme produit par <input type="date"> et par
// src/utils/excelImport.ts (import en masse), pour qu'une date saisie au
// clavier et une date obtenue autrement (import Excel, ancien brouillon)
// donnent exactement la même valeur stockée.

/** Ne garde que les chiffres de la saisie et les regroupe en JJ/MM/AAAA au
 * fur et à mesure — sans jamais dépasser 8 chiffres. Les « / » ne sont
 * jamais tapés par l'utilisateur, ils sont uniquement affichés : un
 * caractère supprimé (backspace) recalcule le masque depuis les chiffres
 * restants, il n'y a donc rien de spécial à faire pour la suppression. */
export function masquerSaisieDateNaissance(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, '').slice(0, 8);
  const groupes = [chiffres.slice(0, 2), chiffres.slice(2, 4), chiffres.slice(4, 8)];
  return groupes.filter(g => g !== '').join('/');
}

/** ISO (AAAA-MM-JJ) → affichage (JJ/MM/AAAA), pour initialiser le champ
 * depuis une fiche existante. Chaîne vide si `iso` est vide ou mal formée. */
export function formaterDateNaissanceAffichage(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export type ResultatDateNaissance =
  | { statut: 'incomplete' }
  | { statut: 'invalide' }
  | { statut: 'future' }
  | { statut: 'valide'; iso: string };

/** Résout une saisie masquée JJ/MM/AAAA. Règles :
 * - moins de 10 caractères (JJ/MM/AAAA complet, donc année sur 4 chiffres —
 *   une année à deux chiffres est donc simplement une saisie incomplète,
 *   jamais interprétée/complétée automatiquement) → 'incomplete' ;
 * - date calendaire inexistante (31/02, 31/04...) → 'invalide' ;
 * - date dans le futur → 'future' ;
 * - sinon → 'valide', avec l'ISO correspondant.
 *
 * `aujourdHui` est injectable (comme calculerDebutReprise dans horaires.ts)
 * pour tester la règle « future » sans dépendre de l'horloge système. */
export function parserDateNaissanceSaisie(
  saisie: string,
  aujourdHui: Date = new Date(),
): ResultatDateNaissance {
  const m = saisie.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { statut: 'incomplete' };

  const jour = Number(m[1]);
  const mois = Number(m[2]);
  const annee = Number(m[3]);

  // new Date(1957, 1, 31) ne lève pas d'erreur : elle « déborde » sur le
  // 3 mars (1957 n'est pas bissextile). La seule façon fiable de détecter un
  // 31/02 est de reconstruire la date et de comparer aux valeurs saisies.
  const date = new Date(annee, mois - 1, jour);
  const estCalendaireValide =
    date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour;
  if (!estCalendaireValide) return { statut: 'invalide' };

  const limite = new Date(aujourdHui);
  limite.setHours(0, 0, 0, 0);
  if (date > limite) return { statut: 'future' };

  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return { statut: 'valide', iso };
}

/** Message affiché sous le champ. `null` pour 'valide' (rien à afficher). */
export function messageErreurDateNaissance(resultat: ResultatDateNaissance): string | null {
  switch (resultat.statut) {
    case 'incomplete': return 'Date incomplète — format attendu JJ/MM/AAAA.';
    case 'invalide':   return 'Cette date n’existe pas.';
    case 'future':     return 'La date de naissance ne peut pas être dans le futur.';
    case 'valide':     return null;
  }
}
