// GET /api/patient/me
// Renvoie toutes les données de l'espace patient (participant, bilans,
// séances, programmes V1/V2, documents partagés, historique de séances)
// filtrées par le participant_id du JWT — jamais par un id fourni par le
// client.

import { getServiceClient, verifyPatientToken, extractBearerToken, getClientIp, logAuditEvent } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

// Contrôle de partage bénéficiaire — voir supabase/migrations/20260713_visibilite_beneficiaire.sql
// et src/types/index.ts (VisibiliteBeneficiaire, Bilan.visibleBeneficiaire).
// Appliqué ICI (avant l'envoi de la réponse), pas seulement côté React : un
// champ retiré ici n'atteint jamais le navigateur du bénéficiaire, contrairement
// à un filtre purement côté affichage.

export const VISIBILITE_DEFAULT = {
  progression: true, bilans: true, rdv: true, programme: true, messagePierre: true, carteSante: true,
};

// Colonnes DB d'un bilan à retirer quand le résultat correspondant n'est pas
// explicitement partagé (bilans.visible_beneficiaire, défaut : tout caché).
const COLONNES_PAR_RESULTAT: Record<string, string[]> = {
  equilibre: ['equilibre_droite', 'equilibre_gauche'],
  force: ['chair_stand_30'],
  handGrip: ['hand_grip_droite', 'hand_grip_gauche'],
  mobilite: ['tug_3m'],
  endurance: [
    'tm6_distance_metres', 'tm6_repetitions', 'tm6_fc_avant', 'tm6_fc_apres',
    'tm6_fc_1min', 'tm6_fc_2min', 'tm6_spo2_avant', 'tm6_spo2_apres',
    'tm6_spo2_1min', 'tm6_spo2_2min', 'tm6_borg_rpe',
  ],
};

const COLONNES_SEDENTARITE = ['sedentarite_score', 'sedentarite_profil', 'sedentarite_reponses'];
const COLONNES_FATIGUE = ['fatigue_score', 'fatigue_profil', 'fatigue_reponses'];

/** Retire des clés d'un objet flat (formulaireFlat.data, à l'intérieur de
 *  bilan_initial_data) — même liste de clés que getTestsAutonomie() lit en
 *  repli côté frontend (src/lib/anamnese.ts), pour qu'un résultat caché ne
 *  fuite pas par ce chemin alternatif. */
function retirerClesFlat(flat: Record<string, unknown> | undefined, cles: string[]): void {
  if (!flat) return;
  for (const c of cles) delete flat[c];
}

/** Filtre un bilan (ligne DB brute) selon visible_beneficiaire (par résultat)
 *  et les flags sédentarité/fatigue de l'anamnèse du participant. Mutation
 *  en place — le bilan n'est jamais renvoyé tel quel, seulement sa version
 *  filtrée. */
export function filtrerBilan(bilan: any, sedentariteVisible: boolean, fatigueVisible: boolean): any {
  const visible = bilan.visible_beneficiaire ?? {};
  for (const [resultat, colonnes] of Object.entries(COLONNES_PAR_RESULTAT)) {
    if (visible[resultat] !== true) {
      for (const col of colonnes) bilan[col] = null;
    }
  }
  const flat = bilan.bilan_initial_data?.formulaireFlat?.data;
  if (!sedentariteVisible) {
    for (const col of COLONNES_SEDENTARITE) bilan[col] = null;
    retirerClesFlat(flat, ['sedentariteScore', 'sedentariteProfil', 'sedentariteReponses']);
  }
  if (!fatigueVisible) {
    for (const col of COLONNES_FATIGUE) bilan[col] = null;
    retirerClesFlat(flat, ['fatigueScore', 'fatigueProfil', 'fatigueReponses']);
  }
  return bilan;
}

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
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

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const [participantRes, bilansRes, seancesRes, programmesRes, docsRes, testsActifsRes, testsResultatsRes, exLibresActifsRes, exLibresValidationsRes] = await Promise.all([
    supabase.from('participants').select('*').eq('id', participantId).single(),
    supabase.from('bilans').select('*').eq('participant_id', participantId).order('date'),
    // Colonnes explicites (pas select('*')) : motif_annulation/
    // motif_annulation_detail sont une donnée interne au praticien et ne
    // doivent jamais atteindre la réponse envoyée au bénéficiaire.
    supabase.from('seances')
      .select('id, participant_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut, notes, adresse, coordonnees, created_at, updated_at')
      .eq('participant_id', participantId).order('date'),
    supabase.from('programmes').select('*').eq('participant_id', participantId),
    supabase.from('documents_patient')
      .select('id, titre, contenu, date_creation')
      .eq('participant_id', participantId)
      .order('date_creation', { ascending: false }),
    // Activités hors programme (tests étalons + exercices libres) : ne
    // jamais exposer un test/exercice non explicitement activé pour ce
    // participant (sécurité non négociable).
    supabase.from('tests_etalons_activations')
      .select('test_id').eq('participant_id', participantId).eq('actif', true),
    supabase.from('tests_etalons_resultats')
      .select('id, test_id, valeur, date_test').eq('participant_id', participantId)
      .order('date_test', { ascending: false }).limit(200),
    supabase.from('exercices_libres_activations')
      .select('id, exercice_id, nom, description, consigne_securite, categorie')
      .eq('participant_id', participantId).eq('actif', true),
    supabase.from('exercices_libres_validations')
      .select('exercice_id, date, fait, note').eq('participant_id', participantId)
      .order('date', { ascending: false }).limit(200),
  ]);

  if (participantRes.error || !participantRes.data) {
    await logAuditEvent(supabase, 'patient_data_access', participantId, getClientIp(req), false);
    return res.status(404).json({ error: 'Patient introuvable' });
  }

  await logAuditEvent(supabase, 'patient_data_access', participantId, getClientIp(req), true);

  const participant = participantRes.data;
  const visibilite = { ...VISIBILITE_DEFAULT, ...(participant.visibilite_beneficiaire ?? {}) };
  if (!visibilite.messagePierre) participant.message_beneficiaire = null;

  const sedentariteVisible = participant.anamnese?.sedentariteVisibleBeneficiaire === true;
  const fatigueVisible = participant.anamnese?.fatigueVisibleBeneficiaire === true;
  if (!sedentariteVisible && participant.anamnese) {
    delete participant.anamnese.sedentariteScore;
    delete participant.anamnese.sedentariteProfil;
    delete participant.anamnese.sedentariteReponses;
  }
  if (!fatigueVisible && participant.anamnese) {
    delete participant.anamnese.fatigueScore;
    delete participant.anamnese.fatigueProfil;
    delete participant.anamnese.fatigueReponses;
  }

  const bilans = visibilite.bilans
    ? (bilansRes.data ?? []).map((b: any) => filtrerBilan(b, sedentariteVisible, fatigueVisible))
    : [];
  const seances = visibilite.rdv ? (seancesRes.data ?? []) : [];

  const programmes = visibilite.programme ? (programmesRes.data ?? []) : [];
  const v2ProgrammeIds = programmes.filter((p: any) => p.type != null).map((p: any) => p.id);

  let programmeSeances: any[] = [];
  let programmePlanning: any[] = [];
  let programmeExercices: any[] = [];

  if (v2ProgrammeIds.length > 0) {
    const [seancesV2Res, planningRes] = await Promise.all([
      supabase.from('programme_seances').select('*').in('programme_id', v2ProgrammeIds).order('ordre'),
      supabase.from('programme_planning').select('*').in('programme_id', v2ProgrammeIds),
    ]);
    programmeSeances = seancesV2Res.data ?? [];
    programmePlanning = planningRes.data ?? [];

    const seanceIds = programmeSeances.map((s: any) => s.id);
    if (seanceIds.length > 0) {
      const exRes = await supabase
        .from('programme_exercices')
        .select('*')
        .in('seance_id', seanceIds)
        .order('ordre');
      programmeExercices = exRes.data ?? [];
    }
  }

  const spRes = await supabase
    .from('seances_patient')
    .select('id, programme_id, seance_id, date_seance, statut, commentaire_patient, duree_minutes')
    .eq('participant_id', participantId)
    .order('date_seance', { ascending: false })
    .limit(15);

  const seancesPatient = spRes.data ?? [];
  let exercicesRealises: any[] = [];

  if (seancesPatient.length > 0) {
    const erRes = await supabase
      .from('exercices_realises')
      .select('seance_patient_id, realise')
      .in('seance_patient_id', seancesPatient.map((s: any) => s.id));
    exercicesRealises = erRes.data ?? [];
  }

  // Décompte total des séances autonomes validées par programme (non limité
  // à 15, contrairement à l'historique ci-dessus) — alimente la progression
  // "X / objectif" affichée au patient, distincte des séances ENCADRÉES.
  const allSpRes = await supabase
    .from('seances_patient')
    .select('programme_id')
    .eq('participant_id', participantId);

  const seancesAutonomesCount: Record<string, number> = {};
  for (const row of allSpRes.data ?? []) {
    const progId = (row as any).programme_id as string;
    seancesAutonomesCount[progId] = (seancesAutonomesCount[progId] ?? 0) + 1;
  }

  return res.status(200).json({
    participantId,
    participant,
    bilans,
    seances,
    programmes,
    programmeSeances,
    programmePlanning,
    programmeExercices,
    documentsPatient: docsRes.data ?? [],
    seancesPatient,
    exercicesRealises,
    seancesAutonomesCount,
    testsEtalonsActifs: (testsActifsRes.data ?? []).map((r: any) => r.test_id as string),
    testsEtalonsResultats: testsResultatsRes.data ?? [],
    exercicesLibresActifs: exLibresActifsRes.data ?? [],
    exercicesLibresValidations: exLibresValidationsRes.data ?? [],
  });
});
