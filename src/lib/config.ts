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
 * Sert de repli à getAppHost()/getAppOrigin() pour la PRODUCTION RÉELLE uniquement, pour
 * les artefacts longue durée : QR code d'accès patient (ModalEspacePatient.tsx), lien
 * portail structure (StructureDetail.tsx), abonnement ICS (SettingsPage.tsx). Ces
 * artefacts sont imprimés, scannés ou souscrits des semaines après leur génération —
 * contrairement à un lien "copier/partager" ouvert immédiatement par l'utilisateur
 * courant, ils ne doivent jamais dépendre de l'origine du navigateur en PRODUCTION.
 *
 * Avant ce correctif, getAppHost() dérivait systématiquement de window.location : un
 * praticien dont l'onglet était resté sur un ancien alias Vercel (`horizon-app.vercel.app`
 * — toujours en ligne, sans redirection vers ce domaine, vérifié le 2026-09-22) générait
 * un QR code menant à cet ancien alias, indéfiniment.
 *
 * Sur Preview et en dev local, window.location reste la source de vérité (comportement
 * inchangé) : l'URL y est éphémère, personne n'imprime un QR depuis là pour un vrai
 * bénéficiaire, et un test « scanner le QR d'un Preview » doit atterrir sur CE Preview.
 */
const DOMAINE_CANONIQUE = 'app.horizon-suivi.fr';

/**
 * Vrai uniquement sur le déploiement de PRODUCTION réel — jamais sur un Preview, jamais
 * en dev local. VITE_VERCEL_ENV est injecté au build par vite.config.ts (`define`) à
 * partir de la variable système VERCEL_ENV que Vercel fournit lui-même : 'production'
 * seulement pour le déploiement servi sur app.horizon-suivi.fr, 'preview' pour toute
 * PR/branche, absente en dev local — donc toujours falsy hors production réelle.
 */
function enProduction(): boolean {
  return (import.meta.env.VITE_VERCEL_ENV as string | undefined) === 'production';
}

/**
 * Domaine effectif pour ces artefacts longue durée : VITE_APP_URL si configurée (à
 * redéfinir sans redéploiement si le domaine change un jour) ; sinon, en production
 * réelle, DOMAINE_CANONIQUE en dur ; sinon (Preview, dev local) window.location, comme
 * avant ce correctif.
 */
function domaineConfigure(): string {
  const override = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (override) return override.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!enProduction() && typeof window !== 'undefined' && window.location?.host) {
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
 * que hors production réelle et sans VITE_APP_URL, le protocole réel de window.location
 * est gardé (http en général sur localhost) plutôt que de forcer https.
 */
export function getAppOrigin(): string {
  const override = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
  if (!override && !enProduction() && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return `https://${domaineConfigure()}`;
}
