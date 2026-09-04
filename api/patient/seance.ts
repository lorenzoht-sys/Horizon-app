// POST /api/patient/seance
// Enregistre une séance réalisée par le patient (seances_patient +
// exercices_realises). Le participant_id provient exclusivement du JWT,
// jamais du corps de la requête.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

const STATUTS_VALIDES = ['terminee', 'partielle', 'en_cours'];

// Comparaison d'ENSEMBLES, pas de cardinalités — règle de méthode de
// docs/PLAN-BETA.md (« un contrôle compare un ensemble exact »). Compter les
// lignes renvoyées suffirait à laisser passer un id étranger dès qu'un id
// légitime est envoyé deux fois. Exporté pour être testé seul : c'est la
// partie du contrôle F-14 qui peut être écrite juste et se tromper quand même.
export function tousExercicesAutorises(idsRecus: string[], idsAutorises: string[]): boolean {
  const autorises = new Set(idsAutorises);
  return idsRecus.every(id => autorises.has(id));
}

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  let participantId: string;
  try {
    participantId = await verifyPatientToken(token);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  const body = req.body ?? {};
  const { programmeId, seanceId, dateSeance, statut, commentairePatient, dureeMinutes, exercices } = body;

  if (
    !programmeId || typeof programmeId !== 'string' ||
    !seanceId || typeof seanceId !== 'string' ||
    !dateSeance || typeof dateSeance !== 'string' ||
    !STATUTS_VALIDES.includes(statut) ||
    !Array.isArray(exercices)
  ) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  // ── Anti-IDOR ─────────────────────────────────────────────────────────
  // Cette route utilise service_role, qui contourne RLS. Les trois
  // identifiants ci-dessous viennent du body et ne sont contraints en base
  // que par des FK, qui prouvent l'EXISTENCE d'une ligne, jamais son
  // APPARTENANCE au participant du JWT. Chaîne vérifiée sur le schéma réel
  // le 2026-09-03 :
  //   programmes.participant_id      -> participants(id)
  //   programme_seances.programme_id -> programmes(id)
  //   programme_exercices.seance_id  -> programme_seances(id)
  //
  // 404 partout, jamais 403 : un 403 confirmerait l'existence de la ligne et
  // rouvrirait l'oracle que ces contrôles ferment.

  // (1) Le programme appartient-il au participant du JWT ?
  const { data: programme, error: programmeErr } = await supabase
    .from('programmes')
    .select('id')
    .eq('id', programmeId)
    .eq('participant_id', participantId)
    .maybeSingle();

  if (programmeErr || !programme) {
    console.error('[seance] programmeId refusé:', programmeId, 'participant:', participantId, programmeErr);
    await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
    return res.status(404).json({ error: 'Programme introuvable' });
  }

  // (2) La séance appartient-elle à CE programme ?
  const { data: programmeSeance, error: programmeSeanceErr } = await supabase
    .from('programme_seances')
    .select('id')
    .eq('id', seanceId)
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (programmeSeanceErr || !programmeSeance) {
    console.error('[seance] seanceId refusé:', seanceId, 'programme:', programmeId, programmeSeanceErr);
    await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
    return res.status(404).json({ error: 'Séance introuvable' });
  }

  // (3) [F-14] Chaque exercice appartient-il à CETTE séance ?
  // Un seul aller-retour, jamais un .eq() par exercice : interroger les ids
  // un par un recréerait, par le patron des réponses, l'oracle d'existence
  // que ce contrôle ferme. Les ids circulent légitimement jusqu'au navigateur
  // (GET /api/patient/me) et restent valides après un changement de
  // programme — ce ne sont pas des secrets.
  const idsRecus: string[] = exercices
    .filter((ex: { id?: unknown } | null | undefined) => ex && typeof ex.id === 'string')
    .map((ex: { id: string }) => ex.id);

  if (idsRecus.length > 0) {
    const { data: exercicesAutorises, error: exercicesErr } = await supabase
      .from('programme_exercices')
      .select('id')
      .eq('seance_id', seanceId)
      .in('id', idsRecus);

    if (exercicesErr || !tousExercicesAutorises(idsRecus, (exercicesAutorises ?? []).map((e: { id: string }) => e.id))) {
      console.error('[seance] exercices refusés pour la séance:', seanceId, exercicesErr);
      await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
      return res.status(404).json({ error: 'Exercice introuvable' });
    }
  }

  const { data: sp, error: spErr } = await supabase
    .from('seances_patient')
    .insert({
      participant_id: participantId,
      programme_id: programmeId,
      seance_id: seanceId,
      date_seance: dateSeance,
      statut,
      commentaire_patient: typeof commentairePatient === 'string' && commentairePatient.trim() ? commentairePatient.trim() : null,
      duree_minutes: typeof dureeMinutes === 'number' ? dureeMinutes : null,
    })
    .select()
    .single();

  if (spErr || !sp) {
    await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
    if (spErr?.code === '23505') {
      return res.status(409).json({ error: 'Vous avez déjà validé cette séance aujourd\'hui.' });
    }
    return res.status(500).json({ error: 'Erreur enregistrement séance' });
  }

  for (const ex of exercices) {
    if (!ex || typeof ex.id !== 'string') continue;
    const { error: exErr } = await supabase.from('exercices_realises').insert({
      seance_patient_id: sp.id,
      exercice_id: ex.id,
      realise: ex.realise === true,
      commentaire: typeof ex.commentaire === 'string' && ex.commentaire.trim() ? ex.commentaire.trim() : null,
    });
    if (exErr) {
      await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
      return res.status(500).json({ error: 'Erreur enregistrement exercice' });
    }
  }

  await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), true);
  return res.status(200).json({ ok: true, seancePatientId: sp.id });
});
