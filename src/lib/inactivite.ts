// Déconnexion du praticien après inactivité (2026-11-11).
//
// Pourquoi : une session praticien ouverte sur un poste ou une tablette laissé
// sans surveillance donne accès à toutes les fiches. Supabase renouvelle la
// session indéfiniment tant que l'onglet existe : sans ce délai, elle ne
// s'éteint jamais d'elle-même.
//
// La date de dernière activité est dans localStorage, donc commune à tous les
// onglets : travailler dans un onglet garde les autres connectés, et la
// déconnexion les ferme tous. Elle survit à la fermeture du navigateur : une
// session restaurée après le délai est fermée dès l'ouverture.
//
// Les brouillons de bilan et de fiche sont conservés à la déconnexion
// (voir App.tsx, SIGNED_OUT) : rien de saisi n'est perdu.

export const DELAI_INACTIVITE_MS = 60 * 60_000;
export const PREAVIS_INACTIVITE_MS = 2 * 60_000;
export const CLE_DERNIERE_ACTIVITE = 'horizon_derniere_activite';

export type EtatInactivite = 'actif' | 'preavis' | 'expire';

export function etatInactivite(
  derniereActivite: number,
  maintenant: number,
  delai: number = DELAI_INACTIVITE_MS,
  preavis: number = PREAVIS_INACTIVITE_MS,
): EtatInactivite {
  const ecoule = maintenant - derniereActivite;
  if (ecoule >= delai) return 'expire';
  if (ecoule >= delai - preavis) return 'preavis';
  return 'actif';
}

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Dernière activité connue ; absente ou illisible : `maintenant` (une session qui démarre). */
export function lireDerniereActivite(stockage: Stockage, maintenant: number): number {
  try {
    const brut = stockage.getItem(CLE_DERNIERE_ACTIVITE);
    const valeur = brut === null ? NaN : Number(brut);
    // Une date dans le futur (horloge modifiée) ne doit pas prolonger la session.
    if (!Number.isFinite(valeur) || valeur > maintenant) return maintenant;
    return valeur;
  } catch {
    return maintenant;
  }
}

export function noterActivite(stockage: Stockage, maintenant: number): void {
  try {
    stockage.setItem(CLE_DERNIERE_ACTIVITE, String(maintenant));
  } catch {
    // Stockage indisponible (navigation privée stricte) : pas de suivi possible.
  }
}

export function oublierActivite(stockage: Stockage): void {
  try {
    stockage.removeItem(CLE_DERNIERE_ACTIVITE);
  } catch {
    // idem
  }
}
