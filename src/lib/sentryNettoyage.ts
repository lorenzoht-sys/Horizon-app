// Nettoyage des événements et breadcrumbs Sentry côté front, extrait de
// sentry.ts pour être testé sans charger le SDK (lot D sécurité HDS,
// 2026-10-27). Aucune donnée de santé ni identifiant de bénéficiaire ne doit
// atteindre Sentry : voir docs/SENTRY.md.
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Chemin seul : query string et hash retirés (?code=, ?ptoken=, ?token=,
 *  filtres Supabase REST comme ?prenom=eq.Camille), UUID remplacés par :id,
 *  jetons dans le chemin (/structure/<jeton>, /client/<jeton>) par :token. */
export function nettoyerUrl(url: string, origine = 'http://localhost'): string {
  try {
    const u = new URL(url, origine);
    return u.pathname
      .replace(RE_UUID, ':id')
      .replace(/\/structure\/[^/]+/, '/structure/:token')
      .replace(/\/client\/[^/]+/, '/client/:token');
  } catch {
    return '/';
  }
}

export function nettoyerEvenement(event: ErrorEvent, origine?: string): ErrorEvent {
  // sendDefaultPii: false n'empêche pas un appel explicite à setUser() :
  // on retire l'utilisateur à l'envoi, quelle que soit sa source.
  delete event.user;
  if (event.request) {
    if (event.request.url) event.request.url = nettoyerUrl(event.request.url, origine);
    delete event.request.query_string;
    delete event.request.cookies;
  }
  return event;
}

/** Type d'élément seul (« button ») : le sélecteur que Sentry construit pour
 *  un clic contient id, classes, title et aria-label — souvent le nom du
 *  bénéficiaire (« Supprimer Jeanne Martin »). */
function typeElement(message: string | undefined): string | undefined {
  if (!message) return message;
  const dernier = message.split('>').pop()?.trim() ?? '';
  return /^[a-zA-Z][\w-]*/.exec(dernier)?.[0].toLowerCase() ?? 'element';
}

export function nettoyerBreadcrumb(breadcrumb: Breadcrumb, origine?: string): Breadcrumb | null {
  // Évite de transmettre le contenu des console.log/console.error, qui
  // pourrait contenir des données de santé.
  if (breadcrumb.category === 'console') return null;
  if (breadcrumb.category?.startsWith('ui.')) {
    return { ...breadcrumb, message: typeElement(breadcrumb.message), data: undefined };
  }
  if (breadcrumb.data) {
    const data = { ...breadcrumb.data };
    // Navigation : from/to portent les mêmes jetons que l'URL de la page.
    for (const cle of ['url', 'from', 'to'] as const) {
      if (data[cle] != null) data[cle] = nettoyerUrl(String(data[cle]), origine);
    }
    breadcrumb = { ...breadcrumb, data };
  }
  return breadcrumb;
}
