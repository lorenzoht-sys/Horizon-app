// POST /api/seances/supprimer-planifiees
// Supprime toutes les séances statut='planifiee' à partir de dateMin
// pour les contrats listés, après vérification que tous appartiennent
// au praticien authentifié. Ne touche jamais aux séances realisee ou annulee.

import { getServiceClient, extractBearerToken } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Session invalide ou expirée' });

  const praticienId = userData.user.id;
  const { contratIds, dateMin } = req.body ?? {};

  if (!Array.isArray(contratIds) || contratIds.length === 0 || typeof dateMin !== 'string') {
    return res.status(400).json({ error: 'contratIds[] et dateMin requis' });
  }

  // Vérifie que tous les contrats appartiennent au praticien authentifié
  const { data: contrats, error: contratErr } = await supabase
    .from('contrats')
    .select('id')
    .in('id', contratIds)
    .eq('praticien_id', praticienId);

  if (contratErr) return res.status(500).json({ error: 'Erreur vérification contrats' });

  const verified = (contrats ?? []).map((c: { id: string }) => c.id);
  if (verified.length !== contratIds.length) {
    return res.status(403).json({ error: 'Accès refusé : certains contrats ne vous appartiennent pas' });
  }

  const { data: deleted, error: deleteErr } = await supabase
    .from('seances')
    .delete()
    .in('contrat_id', verified)
    .eq('statut', 'planifiee')
    .gte('date', dateMin)
    .select('id');

  if (deleteErr) return res.status(500).json({ error: 'Erreur suppression séances' });

  return res.status(200).json({ ok: true, supprimees: (deleted ?? []).length });
});
