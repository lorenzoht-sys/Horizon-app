// Tâche 6 (consolidation) — Sentry côté serverless (api/*).
//
// Activé uniquement si SENTRY_DSN est configuré (variable d'environnement
// Vercel, Production uniquement — voir docs/SENTRY.md). Sans cette
// variable, withSentry() exécute simplement le handler, sans appel réseau
// ni comportement modifié.

import * as Sentry from '@sentry/node';

let initialized = false;

function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      // Ne jamais transmettre le corps des requêtes (peut contenir des
      // données de santé : prompts /api/claude, codes patient...), les
      // cookies, ni les en-têtes d'authentification.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          for (const key of Object.keys(event.request.headers)) {
            if (/^(authorization|cookie)$/i.test(key)) delete event.request.headers[key];
          }
        }
      }
      return event;
    },
  });
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
      Sentry.captureException(err, { tags: { route: req.url } });
      await Sentry.flush(2000);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur serveur' });
      }
    }
  };
}
