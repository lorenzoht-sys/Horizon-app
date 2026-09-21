// POST /api/patient/activite
// Enregistre une activité autonome du patient. Le champ `type` discrimine :
//   'test-etalon'    → résultat chronométré (insert non modifiable)
//   'exercice-libre' → case togglable (upsert sur participant+exercice+date)
//   'cours-presence' → réponse « Je viens / Je ne viens pas » à un cours collectif
//
// ── Pourquoi « cours-presence » vit ici ─────────────────────────────────────
// Ce n'est pas un choix de conception, c'est une contrainte de plan : Vercel Hobby
// plafonne à 12 fonctions serverless et api/ en compte exactement 12 (voir
// api/organisation.ts, api/patient/session.ts). Une route dédiée serait la
// treizième et casserait le déploiement. À reprendre dans un fichier à part le jour
// du passage au plan Pro. La logique métier est dans api/_lib/presenceAnnoncee.ts.
//
// Fusionne les anciens /api/patient/test-etalon et /api/patient/exercice-libre.
// participant_id provient exclusivement du JWT, jamais du body.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import {
  validerCorpsCoursPresence, evaluerReponse, rendezVousVisibles, reponseValide, MESSAGES_REFUS,
} from '../_lib/presenceAnnoncee.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  let participantId: string;
  try {
    participantId = await verifyPatientToken(token);
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }

  const body = req.body ?? {};
  const { type } = body;

  if (type !== 'test-etalon' && type !== 'exercice-libre' && type !== 'cours-presence') {
    return res.status(400).json({ error: 'type requis : "test-etalon", "exercice-libre" ou "cours-presence"' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  // ── test-etalon ───────────────────────────────────────────────────────────
  if (type === 'test-etalon') {
    const { testId, valeur, dateTest } = body;

    if (
      !testId || typeof testId !== 'string' ||
      typeof valeur !== 'number' || !Number.isInteger(valeur) || valeur < 0 ||
      (dateTest !== undefined && typeof dateTest !== 'string')
    ) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }

    const { data: activation } = await supabase
      .from('tests_etalons_activations')
      .select('actif')
      .eq('participant_id', participantId)
      .eq('test_id', testId)
      .maybeSingle();

    if (!activation?.actif) {
      await logAuditEvent(supabase, 'patient_test_etalon_submit', participantId, getClientIp(req), false);
      return res.status(403).json({ error: 'Ce test n\'est pas activé pour ce patient' });
    }

    const { error: insErr } = await supabase.from('tests_etalons_resultats').insert({
      participant_id: participantId,
      test_id: testId,
      valeur,
      date_test: dateTest ?? new Date().toISOString().split('T')[0],
    });

    if (insErr) {
      await logAuditEvent(supabase, 'patient_test_etalon_submit', participantId, getClientIp(req), false);
      return res.status(500).json({ error: 'Erreur enregistrement du résultat' });
    }

    await logAuditEvent(supabase, 'patient_test_etalon_submit', participantId, getClientIp(req), true);
    return res.status(200).json({ ok: true });
  }

  // ── cours-presence ────────────────────────────────────────────────────────
  // « Je viens » / « Je ne viens pas », modifiable jusqu'au DÉBUT du cours (aucune
  // tolérance). Distinct de la présence CONSTATÉE par le praticien (statut_presence).
  //
  // Anti-IDOR : le participant vient UNIQUEMENT du jeton. La participation est
  // retrouvée par (cours_id, participant DU JETON) — la contrainte UNIQUE de la table
  // le permet — donc aucun identifiant de participation n'est exposé, et un
  // bénéficiaire ne peut viser que sa propre ligne. Cours inconnu OU cours auquel il
  // n'est pas inscrit : même réponse 404 (un 403 confirmerait que l'id existe).
  if (type === 'cours-presence') {
    const corps = validerCorpsCoursPresence(body);
    if (!corps.ok) return res.status(400).json({ error: corps.erreur });
    const { coursId, reponse } = corps;
    const ip = getClientIp(req);

    // S'il ne voit pas ses rendez-vous (réglage du praticien), il ne voit pas ses cours :
    // il ne peut pas non plus y répondre. Même 404 que « introuvable ».
    const { data: participant } = await supabase
      .from('participants')
      .select('visibilite_beneficiaire')
      .eq('id', participantId)
      .maybeSingle();
    if (!participant || !rendezVousVisibles(participant.visibilite_beneficiaire)) {
      await logAuditEvent(supabase, 'patient_cours_presence_submit', participantId, ip, false, { coursId, motif: 'rdv_masques' });
      return res.status(404).json({ error: 'Cours introuvable' });
    }

    const { data: ligne, error: lecErr } = await supabase
      .from('participations_cours_collectifs')
      .select('id, presence_annoncee, cours_collectifs(id, statut, date, heure_debut)')
      .eq('cours_id', coursId)
      .eq('participant_id', participantId)
      .maybeSingle();
    if (lecErr) {
      console.error('[activite/cours-presence] lecture impossible:', lecErr.code, lecErr.message);
      await logAuditEvent(supabase, 'patient_cours_presence_submit', participantId, ip, false, { coursId, motif: 'lecture' });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    // PostgREST renvoie un objet pour une relation « plusieurs-à-un » ; on tolère un tableau.
    const cours = ligne ? (Array.isArray(ligne.cours_collectifs) ? ligne.cours_collectifs[0] : ligne.cours_collectifs) : null;
    if (!ligne || !cours) {
      await logAuditEvent(supabase, 'patient_cours_presence_submit', participantId, ip, false, { coursId, motif: 'introuvable' });
      return res.status(404).json({ error: 'Cours introuvable' });
    }

    const evaluation = evaluerReponse(cours, new Date());
    if (!evaluation.ok) {
      await logAuditEvent(supabase, 'patient_cours_presence_submit', participantId, ip, false, { coursId, motif: evaluation.refus });
      return res.status(409).json({ error: MESSAGES_REFUS[evaluation.refus], code: evaluation.refus });
    }

    // Même réponse qu'avant : ni écriture ni audit. Rejouer la requête ne coûte rien.
    const precedente = reponseValide(ligne.presence_annoncee);
    if (precedente === reponse) {
      return res.status(200).json({ ok: true, presenceAnnoncee: reponse, inchange: true });
    }

    const { error: majErr } = await supabase
      .from('participations_cours_collectifs')
      .update({ presence_annoncee: reponse, presence_annoncee_le: new Date().toISOString() })
      .eq('id', ligne.id)
      .eq('participant_id', participantId);
    if (majErr) {
      console.error('[activite/cours-presence] écriture impossible:', majErr.code, majErr.message);
      await logAuditEvent(supabase, 'patient_cours_presence_submit', participantId, ip, false, { coursId, motif: 'ecriture' });
      return res.status(500).json({ error: 'Erreur enregistrement' });
    }

    await logAuditEvent(supabase, 'patient_cours_presence_submit', participantId, ip, true, { coursId, reponse, precedente });
    return res.status(200).json({ ok: true, presenceAnnoncee: reponse });
  }

  // ── exercice-libre ────────────────────────────────────────────────────────
  const { exerciceId, date, fait, note } = body;

  if (
    !exerciceId || typeof exerciceId !== 'string' ||
    (date !== undefined && typeof date !== 'string') ||
    (fait !== undefined && typeof fait !== 'boolean') ||
    (note !== undefined && note !== null && typeof note !== 'string')
  ) {
    return res.status(400).json({ error: 'Paramètres invalides' });
  }

  const { data: activation } = await supabase
    .from('exercices_libres_activations')
    .select('actif')
    .eq('participant_id', participantId)
    .eq('exercice_id', exerciceId)
    .maybeSingle();

  if (!activation?.actif) {
    await logAuditEvent(supabase, 'patient_exercice_libre_submit', participantId, getClientIp(req), false);
    return res.status(403).json({ error: 'Cet exercice n\'est pas activé pour ce patient' });
  }

  const { error: upsertErr } = await supabase.from('exercices_libres_validations').upsert({
    participant_id: participantId,
    exercice_id: exerciceId,
    date: date ?? new Date().toISOString().split('T')[0],
    fait: fait ?? true,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
  }, { onConflict: 'participant_id,exercice_id,date' });

  if (upsertErr) {
    await logAuditEvent(supabase, 'patient_exercice_libre_submit', participantId, getClientIp(req), false);
    return res.status(500).json({ error: 'Erreur enregistrement' });
  }

  await logAuditEvent(supabase, 'patient_exercice_libre_submit', participantId, getClientIp(req), true);
  return res.status(200).json({ ok: true });
});
