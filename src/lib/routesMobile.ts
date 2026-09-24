// Navigation de l'interface mobile PAR URL.
//
// AppMobile gardait l'écran affiché en mémoire (useState) et ignorait l'URL.
// Trois conséquences :
//   - une rotation en paysage remplaçait l'interface par la version desktop
//     À L'ACCUEIL, et le retour en portrait repartait de zéro ;
//   - tout lien vers l'espace pro (/participant/123…) ouvrait l'accueil ;
//   - le bouton « retour » du téléphone ne naviguait pas entre les écrans.
//
// Chaque écran mobile a désormais une URL, et quand il existe un équivalent
// desktop, c'est LA MÊME : tourner le téléphone affiche la version desktop
// du même écran, et revenir en portrait rouvre l'écran mobile.

export type OngletMobile = 'accueil' | 'beneficiaires' | 'saisie' | 'tournee' | 'assistant' | 'plus';

export type EcranMobile =
  | { ecran: 'accueil' }
  | { ecran: 'beneficiaires' }
  | { ecran: 'saisie' }
  | { ecran: 'plus' }
  | { ecran: 'tournee' }
  | { ecran: 'assistant'; beneficiaireId: string | null }
  | { ecran: 'parametres' }
  | { ecran: 'nouveauBeneficiaire' }
  | { ecran: 'modifierBeneficiaire'; participantId: string }
  | { ecran: 'nouveauBilan'; participantId: string | null }
  // Écran qui n'existe qu'en version desktop : on invite à tourner le
  // téléphone, l'URL étant déjà la bonne pour la version paysage.
  | { ecran: 'paysage'; retour: string };

export const URLS_MOBILE = {
  accueil: '/',
  beneficiaires: '/?onglet=beneficiaires',
  saisie: '/?onglet=saisie',
  plus: '/?onglet=plus',
  tournee: '/tournee',
  assistant: '/assistant',
  parametres: '/settings',
  archives: '/archives',
  nouveauBeneficiaire: '/participants/nouveau',
  choixBeneficiaireBilan: '/?onglet=saisie&mode=bilan',
  fiche: (id: string) => `/participant/${encodeURIComponent(id)}`,
  modifierBeneficiaire: (id: string) => `/participants/${encodeURIComponent(id)}/modifier`,
  nouveauBilan: (id: string) => `/participant/${encodeURIComponent(id)}/bilan/new`,
  assistantAvec: (id: string) => `/assistant?beneficiaire=${encodeURIComponent(id)}`,
} as const;

// Écrans de l'espace pro sans version téléphone (le préfixe suffit).
const PREFIXES_DESKTOP_SEULEMENT = ['/agenda-v2', '/map', '/zones', '/stats', '/bibliotheque', '/structures', '/admin'];

/**
 * Routes servies par l'interface UNIQUE (responsive) même sous 768 px.
 * Fusion écran par écran : chaque écran fusionné s'ajoute ici, et sa version
 * mobile disparaît. Sur ces routes, mobile et desktop rendent le même arbre
 * React — une rotation n'y démonte rien.
 */
export function estRouteInterfaceUnique(pathname: string): boolean {
  return (
    /^\/participant\/[^/]+\/?$/.test(pathname) ||
    /^\/archives\/?$/.test(pathname) ||
    // Détail d'un bilan existant — mais pas /bilan/new (création, restée
    // mobile-only) : le segment final ne doit jamais valoir "new".
    /^\/participant\/[^/]+\/bilan\/(?!new(?:\/|$))[^/]+\/?$/.test(pathname)
  );
}

function segment(valeur: string): string {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
}

export function ecranMobileDepuisUrl(pathname: string, search: string): EcranMobile {
  const chemin = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);

  if (chemin === '/') {
    switch (params.get('onglet')) {
      case 'beneficiaires': return { ecran: 'beneficiaires' };
      case 'saisie':
        return params.get('mode') === 'bilan' ? { ecran: 'nouveauBilan', participantId: null } : { ecran: 'saisie' };
      case 'plus': return { ecran: 'plus' };
      default: return { ecran: 'accueil' };
    }
  }
  if (chemin === '/tournee') return { ecran: 'tournee' };
  if (chemin === '/assistant') return { ecran: 'assistant', beneficiaireId: params.get('beneficiaire') || null };
  if (chemin === '/settings') return { ecran: 'parametres' };
  if (chemin === '/participants/nouveau') return { ecran: 'nouveauBeneficiaire' };

  let m = /^\/participants\/([^/]+)\/modifier$/.exec(chemin);
  if (m) return { ecran: 'modifierBeneficiaire', participantId: segment(m[1]) };

  m = /^\/participant\/([^/]+)\/bilan\/new$/.exec(chemin);
  if (m) return { ecran: 'nouveauBilan', participantId: segment(m[1]) };

  // Détail d'un bilan, programme, contrat, comparaison, modification…
  // — tous fusionnés ou desktop-only, jamais atteints ici en pratique :
  // estRouteInterfaceUnique() intercepte /bilan/:id avant App.tsx ne monte
  // AppMobile (voir EspacePro, App.tsx).
  m = /^\/participant\/([^/]+)\/.+$/.exec(chemin);
  if (m) return { ecran: 'paysage', retour: `/participant/${m[1]}` };

  if (PREFIXES_DESKTOP_SEULEMENT.some(p => chemin === p || chemin.startsWith(`${p}/`))) {
    return { ecran: 'paysage', retour: URLS_MOBILE.plus };
  }

  return { ecran: 'accueil' };
}

/** Onglet de la barre du bas à mettre en évidence pour cette URL. */
export function ongletDepuisUrl(pathname: string, search: string): OngletMobile | null {
  if (estRouteInterfaceUnique(pathname)) return 'beneficiaires';
  const e = ecranMobileDepuisUrl(pathname, search);
  switch (e.ecran) {
    case 'accueil':
    case 'beneficiaires':
    case 'saisie':
    case 'plus':
    case 'tournee':
    case 'assistant':
      return e.ecran;
    default:
      return null;
  }
}
