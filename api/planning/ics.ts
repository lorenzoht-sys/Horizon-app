// GET /api/planning/ics?token=...
//
// Flux iCalendar (webcal) en lecture seule du planning d'un praticien —
// abonnement à sens unique pour Google Agenda / Calendrier iPhone / Outlook.
// Pas de synchronisation temps réel : le flux est régénéré à la volée à
// chaque requête à partir de l'état courant de la table seances.
//
// Le token est transmis en query string (pas en header custom : les apps
// calendrier ne savent pas ajouter de headers à une souscription webcal),
// validé côté serveur via le client service_role (contourne RLS) — voir
// api/_lib/planningIcs.ts.
//
// Réponses volontairement peu bavardes (404 générique pour token absent ou
// invalide) : c'est un endpoint public, pas de fuite d'information sur
// l'existence d'un mécanisme d'auth.

import { getServiceClient } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import { validatePraticienIcsToken, chargerSeancesPourIcs, genererCalendrierPlanning } from '../_lib/planningIcs.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tokenParam = req.query?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  if (!token) return res.status(404).json({ error: 'Not found' });

  let supabase;
  try {
    supabase = getServiceClient();
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  const praticien = await validatePraticienIcsToken(supabase, token);
  if (!praticien) return res.status(404).json({ error: 'Not found' });

  const seances = await chargerSeancesPourIcs(supabase, praticien.praticienId);
  const ics = genererCalendrierPlanning(seances);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="planning.ics"');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).send(ics);
});
