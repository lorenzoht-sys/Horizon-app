// Âge en années révolues — UNE implémentation pour tout le projet.
//
// Il y en avait 14 (relevé du 2026-09-13), de trois sortes :
//   - comparaison du mois ET du jour : correcte ;
//   - comparaison du mois seul (écran mobile, tableau de bord client, fiches
//     bilan PDF) : un an de trop pendant le mois d'anniversaire, avant le jour ;
//   - division par 365,25 jours (programme IA, portail structure) : fausse
//     autour de l'anniversaire selon la place des années bissextiles.
// L'âge entre dans l'interprétation des tests — normes du handgrip notamment :
// un an d'erreur peut faire changer de tranche.
//
// La date est lue par ses composants, jamais par `new Date('AAAA-MM-JJ')`, qui
// l'interprète comme minuit UTC — soit la veille au soir sur un fuseau à
// l'ouest de Greenwich.
//
// Né un 29 février : les années non bissextiles, l'anniversaire tombe le
// 1er mars (le 28 février, le 29 n'est pas encore atteint).

/**
 * Âge révolu à la date `reference` (aujourd'hui par défaut), ou `null` si la
 * date de naissance est absente, invalide ou postérieure à la référence.
 */
export function calculerAge(dateNaissance: string | null | undefined, reference: Date = new Date()): number | null {
  if (!dateNaissance) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateNaissance);
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);

  // Rejette une date impossible : 31 avril, 29 février d'une année commune.
  const controle = new Date(Date.UTC(annee, mois - 1, jour));
  if (controle.getUTCFullYear() !== annee || controle.getUTCMonth() !== mois - 1 || controle.getUTCDate() !== jour) {
    return null;
  }
  if (Number.isNaN(reference.getTime())) return null;

  const moisRef = reference.getMonth() + 1;
  const jourRef = reference.getDate();
  let age = reference.getFullYear() - annee;
  if (moisRef < mois || (moisRef === mois && jourRef < jour)) age--;
  return age >= 0 ? age : null;
}

/** « 76 ans », ou « âge non renseigné » : pour l'affichage. */
export function libelleAge(dateNaissance: string | null | undefined, reference: Date = new Date()): string {
  const age = calculerAge(dateNaissance, reference);
  return age === null ? 'âge non renseigné' : `${age} ans`;
}
