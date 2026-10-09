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
  // `date` (AAAA-MM-JJ) : jour à afficher à l'ouverture, null = aujourd'hui.
  | { ecran: 'agenda'; date: string | null }
  | { ecran: 'assistant'; beneficiaireId: string | null }
  | { ecran: 'parametres' }
  | { ecran: 'nouveauBeneficiaire' }
  | { ecran: 'modifierBeneficiaire'; participantId: string }
  | { ecran: 'nouveauBilan'; participantId: string | null }
  // Écran qui n'existe qu'en version desktop : on annonce qu'il n'a pas
  // encore de version téléphone (voir EcranPaysage, AppMobile.tsx). Le nom
  // 'paysage' est historique — l'écran n'invite plus à tourner le téléphone,
  // geste sans effet une fois l'app installée (manifest verrouillé en portrait).
  | { ecran: 'paysage'; retour: string };

export const URLS_MOBILE = {
  accueil: '/',
  beneficiaires: '/?onglet=beneficiaires',
  saisie: '/?onglet=saisie',
  plus: '/?onglet=plus',
  tournee: '/tournee',
  // Écran natif mobile (sous-chantier 1, Agenda) — distinct de /agenda-v2
  // (desktop-only, react-big-calendar) : remplace l'ancien renvoi vers
  // /agenda-v2 depuis l'écran "Plus" (Mon activité → Agenda complet).
  agenda: '/agenda',
  // Ouvre l'agenda mobile sur un jour précis — utilisé par la notification
  // push « absence signalée » (urlNotificationAbsencePraticien,
  // api/_lib/absenceSignalee.ts, qui construit la même URL côté serveur).
  agendaJour: (date: string) => `/agenda?date=${encodeURIComponent(date)}`,
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
const PREFIXES_DESKTOP_SEULEMENT = ['/agenda-v2', '/map', '/zones', '/stats', '/admin'];

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
    /^\/participant\/[^/]+\/bilan\/(?!new(?:\/|$))[^/]+\/?$/.test(pathname) ||
    // Rapport d'évolution (comparaison de tous les bilans) — atteignable
    // depuis la fiche et le détail de bilan, déjà fusionnés.
    /^\/participant\/[^/]+\/comparaison\/?$/.test(pathname) ||
    // Création d'un contrat de suivi — atteignable depuis la fiche (carte
    // « Aucun contrat actif », menu « ··· », onglet Contrats), déjà fusionnée.
    // Formulaire simple, sans étapes ni génération de document.
    /^\/participant\/[^/]+\/contrat\/nouveau\/?$/.test(pathname) ||
    // Bibliothèque (exercices + modèles de programme) — grille déjà
    // responsive (1 colonne dès le mobile), glisser-déposer HTML5 (rail de
    // dossiers) doublé d'une alternative sans drag (modale à cases à
    // cocher), et wizard de modèle déjà mobile (chantiers #87/#88/#89).
    /^\/bibliotheque\/?$/.test(pathname) ||
    // Structures (liste + détail) — la liste n'existait comme route nulle
    // part avant ce chantier (simple onglet de Dashboard.tsx, jamais
    // fusionné) : nouvelle page StructuresPage.tsx, construite responsive
    // dès l'écriture. Détail (StructureDetail.tsx) : carte Facturation
    // masquée sous 768px (Phase 4, hors périmètre), le reste fusionné.
    /^\/structures\/?$/.test(pathname) ||
    /^\/structures\/[^/]+\/?$/.test(pathname) ||
    // Facturation (étape 3) : « Factures à valider » et « Factures validées », construites
    // responsive dès l'écriture (une colonne, aucune barre fixe en bas). C'est aussi la cible de
    // la notification push du 1er du mois (api/_lib/facturationMensuelle.ts) : sans cette entrée,
    // un téléphone ouvrirait l'accueil au clic.
    // Suivi du chiffre d'affaires (/factures/ca) : même construction responsive.
    /^\/factures(\/a-valider|\/ca)?\/?$/.test(pathname) ||
    // Profil de facturation (étape 4), atteint depuis Paramètres : formulaire d'une colonne,
    // construit responsive, sans barre fixe en bas. /settings lui-même reste géré par
    // l'écran 'parametres' (SettingsPage sans barre), seule cette sous-page passe ici.
    /^\/settings\/facturation\/?$/.test(pathname)
  );
}

/**
 * `?date=` de l'agenda : AAAA-MM-JJ et jour réellement existant (rejette
 * 2026-02-31, que `new Date` ferait silencieusement glisser en mars) ; null
 * sinon, et l'agenda s'ouvre sur aujourd'hui comme avant.
 */
function dateAgendaValide(valeur: string | null): string | null {
  if (!valeur || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
  const [a, m, j] = valeur.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j ? valeur : null;
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
  if (chemin === '/agenda') return { ecran: 'agenda', date: dateAgendaValide(params.get('date')) };
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
