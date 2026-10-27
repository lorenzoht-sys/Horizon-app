// Tâche 6 (consolidation) — Sentry côté front.
//
// Activé uniquement si VITE_SENTRY_DSN est configuré (variable
// d'environnement Vercel, Production uniquement — voir docs/SENTRY.md).
// Sans cette variable, initSentry() ne fait rien : aucun appel réseau,
// aucun comportement modifié (dev local, Preview/staging...).

import * as Sentry from '@sentry/react';
import { nettoyerBreadcrumb, nettoyerEvenement } from './sentryNettoyage';

// Le nettoyage (URL, utilisateur, breadcrumbs) vit dans sentryNettoyage.ts,
// sans import du SDK, pour être testé.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: event => nettoyerEvenement(event, window.location.origin),
    beforeBreadcrumb: breadcrumb => nettoyerBreadcrumb(breadcrumb, window.location.origin),
  });
}
