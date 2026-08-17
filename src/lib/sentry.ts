// Tâche 6 (consolidation) — Sentry côté front.
//
// Activé uniquement si VITE_SENTRY_DSN est configuré (variable
// d'environnement Vercel, Production uniquement — voir docs/SENTRY.md).
// Sans cette variable, initSentry() ne fait rien : aucun appel réseau,
// aucun comportement modifié (dev local, Preview/staging...).

import * as Sentry from '@sentry/react';

// Retire la query string et le hash d'une URL : les liens patient/structure
// contiennent des tokens et codes d'accès dans leur chemin ou leur query
// (ex: /patient/<id>?code=..., /structure/<token>), et les requêtes Supabase
// REST contiennent des filtres (ex: ?prenom=eq.Camille).
function redactUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    let path = u.pathname
      // UUID (id participant, séance, bilan...) → :id
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      // Token du portail structure → :token
      .replace(/\/structure\/[^/]+/, '/structure/:token');
    return path; // query string et hash volontairement retirés
  } catch {
    return '/';
  }
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.url) event.request.url = redactUrl(event.request.url);
      // Défense en profondeur, cohérent avec api/_lib/sentry.ts : rien
      // n'appelle Sentry.setUser() dans ce projet et sendDefaultPii est déjà
      // à false, donc ces champs devraient déjà être vides — on le garantit
      // explicitement au cas où un futur appel les peuplerait par erreur.
      delete event.user;
      if (event.request) delete event.request.cookies;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Évite de transmettre le contenu des console.log/console.error,
      // qui pourrait contenir des données de santé.
      if (breadcrumb.category === 'console') return null;
      if (breadcrumb.data?.url) breadcrumb.data.url = redactUrl(String(breadcrumb.data.url));
      return breadcrumb;
    },
  });
}
