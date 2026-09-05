// Initiales du praticien affichées dans la pastille d'avatar.
//
// ── Pourquoi ce module existe ───────────────────────────────────────────
// La Sidebar calculait ses initiales ainsi :
//
//   `${prenom[0] ?? 'P'}${nom[0] ?? 'C'}`.toUpperCase()
//
// Sur un compte sans identité — un praticien invité qui vient de terminer
// l'onboarding — les deux replis tombent, et la pastille affiche « PC ».
// Deux lettres plausibles, celles du premier utilisateur du produit, mais
// écrites SÉPARÉMENT dans deux replis différents : c'est pour ça qu'aucune
// recherche sur le nom complet ne les avait trouvées. L'écran mobile avait
// la même faute en plus discret, avec un seul repli — il affichait « P ».
//
// ── Pourquoi c'est plus qu'un défaut cosmétique ─────────────────────────
// Une initiale inventée est indiscernable d'une vraie. Le praticien voit
// une pastille remplie et en conclut que l'application connaît son
// identité, alors qu'elle ne la connaît pas — et que ses contrats de
// prestation, eux, refuseront de se générer faute de nom. L'écran affirme
// le contraire de ce que la base contient. Un placeholder neutre dit la
// vérité : « je ne sais pas qui vous êtes ».
//
// D'où la règle : les vraies initiales, ou rien. Jamais de repli
// alphabétique.

/** Première lettre significative, en majuscule. Chaîne vide si le champ
 *  est vide ou ne contient que des espaces. */
function premiereLettre(valeur: string | null | undefined): string {
  const propre = (valeur ?? '').trim();
  // `[...propre]` et non `propre[0]` : découpe par point de code, pour ne
  // pas couper en deux un prénom dont la première lettre est hors du plan
  // latin de base.
  return propre ? ([...propre][0] ?? '').toLocaleUpperCase('fr-FR') : '';
}

/**
 * Initiales à afficher, de 0 à 2 lettres.
 *
 * Rend une chaîne VIDE quand aucun des deux champs n'est renseigné :
 * c'est le signal, pour l'appelant, qu'il doit afficher un placeholder
 * neutre plutôt qu'un texte. Le module ne choisit pas ce placeholder —
 * la Sidebar a une icône lucide sous la main, l'écran mobile non.
 */
export function initialesPraticien(
  prenom: string | null | undefined,
  nom: string | null | undefined,
): string {
  return `${premiereLettre(prenom)}${premiereLettre(nom)}`;
}
