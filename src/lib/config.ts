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
 * Hôte public de l'application (sans protocole), utilisé pour générer les
 * liens partagés (espace patient, portail structure). Dérivé de
 * window.location pour s'adapter automatiquement à l'environnement
 * (production, preview Vercel/staging, local) sans configuration
 * supplémentaire.
 */
export function getAppHost(): string {
  if (typeof window !== 'undefined' && window.location?.host) {
    return window.location.host;
  }
  return 'localhost:5173';
}
