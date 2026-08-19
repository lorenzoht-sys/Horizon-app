// POST /api/patient/seance
// Enregistre une séance réalisée par le patient (seances_patient +
// exercices_realises). Le participant_id provient exclusivement du JWT,
// jamais du corps de la requête.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

const STATUTS_VALIDES = ['terminee', 'partielle', 'en_cours'];

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
    console.error('[api/patient/seance] getServiceClient:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // Anti-IDOR : cette route utilise service_role (contourne RLS), donc rien
  // n'empêche en base qu'un patient authentifié envoie le programmeId/
  // seanceId d'un AUTRE participant. Vérification explicite avant insert
  // (docs/RAPPORT_SECURITE.md, cartographie §4) : programmeId doit
  // appartenir au participant du JWT, et seanceId doit appartenir à ce
  // programme (seances_patient.seance_id référence programme_seances,
  // programme_seances.programme_id référence programmes).
  const { data: programme, error: programmeErr } = await supabase
    .from('programmes')
    .select('id')
    .eq('id', programmeId)
    .eq('participant_id', participantId)
    .maybeSingle();
  if (programmeErr || !programme) {
    await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
    return res.status(404).json({ error: 'Programme introuvable' });
  }

  const { data: programmeSeance, error: programmeSeanceErr } = await supabase
    .from('programme_seances')
    .select('id')
    .eq('id', seanceId)
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (programmeSeanceErr || !programmeSeance) {
    await logAuditEvent(supabase, 'patient_seance_submit', participantId, getClientIp(req), false);
    return res.status(404).json({ error: 'Séance introuvable' });
  }

  // Anti-IDOR [F-14, docs/RAPPORT_SECURITE.md] : exercices[].id vient du
  // body — la seule contrainte en base est exercices_realises.exercice_id
  // → programme_exercices(id), qui prouve que l'id EXISTE quelque part,
  // jamais qu'il appartient à CE programme. Un id d'un autre participant
  // circule légitimement dans les réponses de l'espace patient (visible
  // côté navigateur) et reste valide après un changement de programme —
  // pas un id à deviner, un id qu'on peut connaître. Vérifié en un seul
  // aller-retour (pas un .eq() par exercice, pour ne pas recréer l'oracle
  // d'existence un par un que ce correctif ferme) : tous les ids fournis
  // doivent appartenir à programme_exercices.seance_id = seanceId, déjà
  // vérifié ci-dessus comme appartenant au participant.
  const exerciceIdsRecus = (Array.isArray(exercices) ? exercices : [])
    .filter((ex: any) => ex && typeof ex.id === 'string')
    .map((ex: any) => ex.id as string);

  if (exerciceIdsRecus.length > 0) {
    const { data: exercicesValides, error: exercicesValidesErr } = await supabase
      .from('programme_exercices')
      .select('id')
      .eq('seance_id', seanceId)
      .in('id', exerciceIdsRecus);
    const idsValides = new Set((exercicesValides ?? []).map((e: { id: string }) => e.id));
    const tousValides = exercicesValidesErr === null && exerciceIdsRecus.every(id => idsValides.has(id));
    if (!tousValides) {
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
