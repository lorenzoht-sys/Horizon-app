// POST /api/patient/activite
// Enregistre une activité autonome du patient. Le champ `type` discrimine :
//   'test-etalon'    → résultat chronométré (insert non modifiable)
//   'exercice-libre' → case togglable (upsert sur participant+exercice+date)
//   'cours-presence' → réponse « Je viens / Je ne viens pas » à un cours collectif
//   'seance-absence' → signale (ou annule le signalement d') une absence pour
//                       la prochaine séance individuelle planifiée
//
// ── Pourquoi tout vit dans le même fichier ──────────────────────────────────
// Ce n'est pas un choix de conception, c'est une contrainte de plan : Vercel Hobby
// plafonne à 12 fonctions serverless et api/ en compte exactement 12 (voir
// api/organisation.ts, api/patient/session.ts). Une route dédiée serait la
// treizième et casserait le déploiement. À reprendre dans un fichier à part le jour
// du passage au plan Pro. La logique métier est dans api/_lib/presenceAnnoncee.ts
// et api/_lib/absenceSignalee.ts.
//
// Fusionne les anciens /api/patient/test-etalon et /api/patient/exercice-libre.
// participant_id provient exclusivement du JWT, jamais du body.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent, type AuditEventType } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import {
  validerCorpsCoursPresence, evaluerReponse, rendezVousVisibles, reponseValide, MESSAGES_REFUS,
} from '../_lib/presenceAnnoncee.js';
import {
  validerCorpsSeanceAbsence, evaluerAbsence, MESSAGES_REFUS_ABSENCE,
  messageAbsenceSignaleePraticien, urlNotificationAbsencePraticien,
} from '../_lib/absenceSignalee.js';
import { checkActiviteRateLimit, recordActiviteAttempt } from '../_lib/activiteRateLimit.js';
import { dateParisCivile } from '../_lib/rappels.js';
import { envoyerAlertePraticien } from '../_lib/notifications.js';

const TYPES_VALIDES = ['test-etalon', 'exercice-libre', 'cours-presence', 'seance-absence'] as const;
type TypeActivite = (typeof TYPES_VALIDES)[number];

// Un événement d'audit par type, utilisé pour le refus par rate limit (avant
// même de savoir si l'action elle-même aurait réussi) et repris tel quel
// dans chaque branche pour ses propres refus/succès.
const EVENEMENT_PAR_TYPE: Record<TypeActivite, AuditEventType> = {
  'test-etalon': 'patient_test_etalon_submit',
  'exercice-libre': 'patient_exercice_libre_submit',
  'cours-presence': 'patient_cours_presence_submit',
  'seance-absence': 'patient_seance_absence_submit',
};

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

  if (!TYPES_VALIDES.includes(type)) {
    return res.status(400).json({ error: `type requis : ${TYPES_VALIDES.map(t => `"${t}"`).join(', ')}` });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  // Rate limit générique (api/_lib/activiteRateLimit.ts), un budget par
  // participant ET par type — un jeton compromis reste limité même utilisé
  // depuis des IP différentes, et un abus sur un type n'affame pas les autres.
  // Compté même sur une requête qui aurait de toute façon échoué plus loin
  // (même principe que checkRateLimit/recordLoginAttempt à la connexion) :
  // c'est le NOMBRE de requêtes qu'on borne, pas leur issue.
  const ipRateLimit = getClientIp(req);
  if (!(await checkActiviteRateLimit(supabase, participantId, type))) {
    await logAuditEvent(supabase, EVENEMENT_PAR_TYPE[type as TypeActivite], participantId, ipRateLimit, false, { motif: 'rate_limit' });
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques minutes.' });
  }
  await recordActiviteAttempt(supabase, participantId, type);

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

  // ── seance-absence ───────────────────────────────────────────────────────
  // Signale (ou annule le signalement d') une absence pour la PROCHAINE
  // séance individuelle planifiée du bénéficiaire — jamais un id choisi par
  // le client (aucun paramètre d'identification dans le corps, voir
  // api/_lib/absenceSignalee.ts : zéro surface IDOR possible sur cette
  // action, contrairement à cours-presence qui doit désigner LEQUEL des
  // cours à venir). Même règle « jusqu'au début, aucune tolérance » que
  // cours-presence. N'écrit jamais `statut` : la séance reste 'planifiee'.
  if (type === 'seance-absence') {
    const corps = validerCorpsSeanceAbsence(body);
    if (!corps.ok) return res.status(400).json({ error: corps.erreur });
    const { signale } = corps;
    const ip = getClientIp(req);

    // Même garde que cours-presence : rendez-vous masqués (réglage du
    // praticien) → le bénéficiaire ne voit aucune séance, il ne peut pas non
    // plus signaler une absence sur une séance qu'il ne voit pas.
    const { data: participant } = await supabase
      .from('participants')
      .select('visibilite_beneficiaire, prenom')
      .eq('id', participantId)
      .maybeSingle();
    if (!participant || !rendezVousVisibles(participant.visibilite_beneficiaire)) {
      await logAuditEvent(supabase, 'patient_seance_absence_submit', participantId, ip, false, { motif: 'rdv_masques' });
      return res.status(404).json({ error: 'Aucune séance à venir' });
    }

    // La « prochaine séance » exactement comme l'écran du bénéficiaire la
    // calcule (EspacePatient.tsx : date >= aujourd'hui, statut 'planifiee',
    // triée par date, la première) — même définition, jamais un id envoyé
    // par le client. `aujourdHui` en Europe/Paris, pas le fuseau du serveur
    // (UTC en production) : une séance ce soir ne doit pas sortir de la
    // fenêtre parce qu'il est déjà minuit passé en UTC.
    const aujourdHui = dateParisCivile(new Date());
    const { data: seance, error: lecErr } = await supabase
      .from('seances')
      .select('id, date, heure_debut, statut, absence_signalee_par_patient_le, praticien_id')
      .eq('participant_id', participantId)
      .eq('statut', 'planifiee')
      .gte('date', aujourdHui)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (lecErr) {
      console.error('[activite/seance-absence] lecture impossible:', lecErr.code, lecErr.message);
      await logAuditEvent(supabase, 'patient_seance_absence_submit', participantId, ip, false, { motif: 'lecture' });
      return res.status(500).json({ error: 'Erreur serveur' });
    }
    if (!seance) {
      await logAuditEvent(supabase, 'patient_seance_absence_submit', participantId, ip, false, { motif: 'aucune_seance' });
      return res.status(404).json({ error: 'Aucune séance à venir' });
    }

    const evaluation = evaluerAbsence(seance, new Date());
    if (!evaluation.ok) {
      await logAuditEvent(supabase, 'patient_seance_absence_submit', participantId, ip, false, { seanceId: seance.id, motif: evaluation.refus });
      return res.status(409).json({ error: MESSAGES_REFUS_ABSENCE[evaluation.refus], code: evaluation.refus });
    }

    // Même réponse qu'avant : ni écriture ni audit. Rejouer la requête ne coûte rien.
    const dejaSignale = seance.absence_signalee_par_patient_le !== null;
    if (dejaSignale === signale) {
      return res.status(200).json({ ok: true, seanceId: seance.id, absenceSignalee: signale, inchange: true });
    }

    const { error: majErr } = await supabase
      .from('seances')
      .update({ absence_signalee_par_patient_le: signale ? new Date().toISOString() : null })
      .eq('id', seance.id)
      .eq('participant_id', participantId);
    if (majErr) {
      console.error('[activite/seance-absence] écriture impossible:', majErr.code, majErr.message);
      await logAuditEvent(supabase, 'patient_seance_absence_submit', participantId, ip, false, { seanceId: seance.id, motif: 'ecriture' });
      return res.status(500).json({ error: 'Erreur enregistrement' });
    }

    // Alerte au praticien PROPRIÉTAIRE uniquement (seance.praticien_id —
    // jamais aux autres membres d'une éventuelle organisation), et
    // uniquement à la SIGNALISATION, jamais à la rétractation (décidé). Ne
    // doit jamais faire échouer l'action elle-même : le patient doit
    // toujours pouvoir signaler, même si l'envoi push échoue — déjà garanti
    // par envoyerAlertePraticien (ne lève jamais), ce try/catch est une
    // seconde ceinture, pas la protection principale.
    if (signale) {
      try {
        await envoyerAlertePraticien(supabase, seance.praticien_id, {
          ...messageAbsenceSignaleePraticien({ prenom: participant.prenom, heure_debut: seance.heure_debut }),
          url: urlNotificationAbsencePraticien(seance.date),
        });
      } catch (err) {
        console.error('[activite/seance-absence] envoi alerte praticien échoué (non bloquant):', err);
      }
    }

    await logAuditEvent(supabase, 'patient_seance_absence_submit', participantId, ip, true, { seanceId: seance.id, signale });
    return res.status(200).json({ ok: true, seanceId: seance.id, absenceSignalee: signale });
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
