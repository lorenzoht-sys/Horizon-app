// État de travail en cours conservé dans sessionStorage.
//
// Sert à survivre au REMPLACEMENT de l'interface : sous 768 px l'espace pro
// affiche AppMobile, au-dessus l'interface desktop (App.tsx). Tourner le
// téléphone démonte l'une et monte l'autre, et tout état React disparaît —
// or le praticien tourne volontairement son téléphone pour atteindre les
// écrans desktop. Au retour en portrait, la saisie doit être là.
//
// sessionStorage et non localStorage : l'état survit à la rotation et au
// rechargement, mais pas à la fermeture de l'onglet — préférable pour des
// données de santé sur un téléphone parfois partagé. Tout est effacé à la
// déconnexion (effacerTousEtatsSession).

const PREFIXE = 'horizon_etat_';

export type StockageSession = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & { readonly length: number };

function stockageParDefaut(): StockageSession | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    // Navigation privée stricte, stockage désactivé : on travaille sans.
    return null;
  }
}

export function lireEtatSession<T>(cle: string, stockage: StockageSession | null = stockageParDefaut()): T | null {
  if (!stockage) return null;
  try {
    const brut = stockage.getItem(PREFIXE + cle);
    return brut === null ? null : (JSON.parse(brut) as T);
  } catch {
    return null;
  }
}

export function ecrireEtatSession(cle: string, valeur: unknown, stockage: StockageSession | null = stockageParDefaut()): void {
  if (!stockage) return;
  try {
    if (valeur === null || valeur === undefined) stockage.removeItem(PREFIXE + cle);
    else stockage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    // Quota dépassé : non bloquant, la saisie reste à l'écran.
  }
}

export function effacerEtatSession(cle: string, stockage: StockageSession | null = stockageParDefaut()): void {
  if (!stockage) return;
  try {
    stockage.removeItem(PREFIXE + cle);
  } catch { /* non bloquant */ }
}

/** À la déconnexion : aucun travail en cours ne doit rester pour la personne suivante. */
export function effacerTousEtatsSession(stockage: StockageSession | null = stockageParDefaut()): void {
  if (!stockage) return;
  try {
    const cles: string[] = [];
    for (let i = 0; i < stockage.length; i++) {
      const k = stockage.key(i);
      if (k?.startsWith(PREFIXE)) cles.push(k);
    }
    cles.forEach(k => stockage.removeItem(k));
  } catch { /* non bloquant */ }
}
