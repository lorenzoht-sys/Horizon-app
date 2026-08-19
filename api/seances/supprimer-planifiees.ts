// POST /api/seances/supprimer-planifiees
// Supprime toutes les séances statut='planifiee' à partir de dateMin
// pour les contrats listés, après vérification que tous appartiennent
// au praticien authentifié. Ne touche jamais aux séances realisee ou annulee.
//
// raison/participantId (optionnels) : quand raison === 'fin_de_contrat'
// (ContratsTab.tsx, réduction de la date de fin d'un contrat), une trace est
// écrite dans audit_logs — nombre de séances supprimées, contrat(s),
// participant, plage de dates réellement supprimée. Absents (autres
// appelants : suppression manuelle de contrat, table rase du planificateur),
// aucune trace n'est écrite — comportement inchangé pour ces flux.

import { getServiceClient, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[api/seances/supprimer-planifiees] getServiceClient:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Session invalide ou expirée' });

  const praticienId = userData.user.id;
  const { contratIds, dateMin, raison, participantId } = req.body ?? {};

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
    .select('id, date');

  if (deleteErr) return res.status(500).json({ error: 'Erreur suppression séances' });

  const nbSupprimees = (deleted ?? []).length;

  if (raison === 'fin_de_contrat' && nbSupprimees > 0) {
    const dates = (deleted ?? []).map((d: { date: string }) => d.date).sort();
    await logAuditEvent(
      supabase,
      'praticien_seances_supprimees_fin_contrat',
      typeof participantId === 'string' ? participantId : null,
      getClientIp(req),
      true,
      { contratIds: verified, nombre: nbSupprimees, dateDebut: dates[0], dateFin: dates[dates.length - 1] },
    );
  }

  return res.status(200).json({ ok: true, supprimees: nbSupprimees });
});
