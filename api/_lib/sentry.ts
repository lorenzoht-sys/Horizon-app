// Tâche 6 (consolidation) — Sentry côté serverless (api/*).
//
// Activé uniquement si SENTRY_DSN est configuré (variable d'environnement
// Vercel, Production uniquement — voir docs/SENTRY.md). Sans cette
// variable, withSentry() exécute simplement le handler, sans appel réseau
// ni comportement modifié.

import * as Sentry from '@sentry/node';

let initialized = false;

// ── Nettoyage (lot D sécurité HDS, 2026-10-27) ─────────────────────────────
// Exportés pour être testés (api/_lib/sentry.test.ts).

/** Chemin seul, sans query string ni hash : les routes reçoivent des jetons
 *  en query (/api/planning/ics?token=…, ?code=, ?ptoken=). */
export function cheminSeul(url: string | undefined | null): string {
  if (!url) return '/';
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

/** Retire corps, cookies, en-têtes d'authentification, query string, et
 *  réduit l'URL au chemin. */
export function nettoyerEvenementServeur<T extends Sentry.ErrorEvent>(event: T): T {
  // Ne jamais transmettre le corps des requêtes (peut contenir des
  // données de santé : prompts /api/claude, codes patient...), les
  // cookies, ni les en-têtes d'authentification.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = cheminSeul(event.request.url);
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (/^(authorization|cookie)$/i.test(key)) delete event.request.headers[key];
      }
    }
  }
  return event;
}

/** Breadcrumbs des appels HTTP sortants (Supabase REST, Anthropic) : leurs
 *  URL portent des filtres (?id=eq.<uuid>, ?code_acces=eq.…). Chemin seul. */
export function nettoyerBreadcrumbServeur(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  if (data.url != null) data.url = cheminSeul(String(data.url));
  delete data['http.query'];
  delete data['http.fragment'];
  return { ...breadcrumb, data };
}

function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: event => nettoyerEvenementServeur(event),
    beforeBreadcrumb: breadcrumb => nettoyerBreadcrumbServeur(breadcrumb),
  });
}

// Journalise un événement métier (pas une exception) dans Sentry, avec
// flush explicite : en serverless, la fonction peut se terminer avant que
// Sentry ait envoyé l'événement en arrière-plan — sans ce flush, l'appel
// serait silencieusement perdu la plupart du temps.
//
// No-op si SENTRY_DSN n'est pas configuré (staging, local), comme
// withSentry(). N'échoue jamais : une panne de journalisation ne doit pas
// faire échouer la requête qu'elle observe.
export async function captureMessage(
  message: string,
  options?: { level?: 'info' | 'warning' | 'error'; tags?: Record<string, string> }
): Promise<void> {
  try {
    initSentry();
    if (!process.env.SENTRY_DSN) return;
    Sentry.captureMessage(message, {
      level: options?.level ?? 'warning',
      tags: options?.tags,
    });
    await Sentry.flush(2000);
  } catch (err) {
    console.error('[sentry] captureMessage a échoué:', err);
  }
}

type Handler = (req: any, res: any) => unknown | Promise<unknown>;

// Capture toute exception non gérée par un handler /api/*, la journalise
// dans Sentry (si configuré), puis répond 500. N'altère pas le comportement
// des handlers qui gèrent déjà leurs propres erreurs.
export function withSentry(handler: Handler): Handler {
  return async (req, res) => {
    initSentry();
    try {
      return await handler(req, res);
    } catch (err) {
      Sentry.captureException(err, { tags: { route: cheminSeul(req.url) } });
      await Sentry.flush(2000);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur serveur' });
      }
    }
  };
}
