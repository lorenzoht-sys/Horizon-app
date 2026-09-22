// Configuration centralisée de l'application.
//
// Toute valeur dépendant de l'environnement (Supabase, URL publique de
// l'app) doit être lue ici et nulle part ailleurs dans src/ — voir
// .env.example pour la liste des variables disponibles, et
// supabase/migrations/SETUP_STAGING.md pour la configuration par
// environnement (Production vs Preview/staging) sur Vercel.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Domaine public canonique de l'application, en dur.
 *
 * Sert de repli à getAppHost()/getAppOrigin() pour tout ce qui est DÉPLOYÉ (preview
 * Vercel compris, pas seulement la production) : QR code d'accès patient
 * (ModalEspacePatient.tsx), lien portail structure (StructureDetail.tsx), abonnement
 * ICS (SettingsPage.tsx). Ces artefacts sont imprimés, scannés ou souscrits des
 * semaines après leur génération — contrairement à un lien "copier/partager" ouvert
 * immédiatement par l'utilisateur courant, ils ne doivent JAMAIS dépendre de l'origine
 * du navigateur au moment où ils sont produits.
 *
 * Avant ce correctif, getAppHost() dérivait systématiquement de window.location : un
 * praticien dont l'onglet était resté sur un ancien alias Vercel (`horizon-app.vercel.app`
 * — toujours en ligne, sans redirection vers ce domaine, vérifié le 2026-09-22) générait
 * un QR code menant à cet ancien alias, indéfiniment.
 */
const DOMAINE_CANONIQUE = 'app.horizon-suivi.fr';

/**
 * Domaine effectif pour ces artefacts longue durée : VITE_APP_URL si configurée (à
 * redéfinir sans redéploiement si le domaine change un jour), sinon DOMAINE_CANONIQUE
 * en dur. `import.meta.env.DEV` est la seule exception : en dev local (`vite dev`),
 * ces artefacts ne quittent jamais le poste du développeur — s'en tenir à
 * window.location y reste sans risque et garde le flux testable sans configuration.
 */
function domaineConfigure(): string {
  const override = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (override) return override.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return DOMAINE_CANONIQUE;
}

/** Hôte public canonique (sans protocole) — voir domaineConfigure(). */
export function getAppHost(): string {
  return domaineConfigure();
}

/**
 * Origine publique canonique (avec protocole) — même règle que domaineConfigure(), sauf
 * qu'en dev local SANS VITE_APP_URL le protocole réel de window.location est gardé (http
 * en général) plutôt que de forcer https sur du localhost.
 */
export function getAppOrigin(): string {
  const override = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (!override && import.meta.env.DEV && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return `https://${domaineConfigure()}`;
}
