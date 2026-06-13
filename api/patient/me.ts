// GET /api/patient/me
// Renvoie toutes les données de l'espace patient (participant, bilans,
// séances, programmes V1/V2, documents partagés, historique de séances)
// filtrées par le participant_id du JWT — jamais par un id fourni par le
// client.

import { getServiceClient, verifyPatientToken, extractBearerToken } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

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

  const [participantRes, bilansRes, seancesRes, programmesRes, docsRes] = await Promise.all([
    supabase.from('participants').select('*').eq('id', participantId).single(),
    supabase.from('bilans').select('*').eq('participant_id', participantId).order('date'),
    supabase.from('seances').select('*').eq('participant_id', participantId).order('date'),
    supabase.from('programmes').select('*').eq('participant_id', participantId),
    supabase.from('documents_patient')
      .select('id, titre, contenu, date_creation')
      .eq('participant_id', participantId)
      .order('date_creation', { ascending: false }),
  ]);

  if (participantRes.error || !participantRes.data) {
    return res.status(404).json({ error: 'Patient introuvable' });
  }

  const programmes = programmesRes.data ?? [];
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

  return res.status(200).json({
    participantId,
    participant: participantRes.data,
    bilans: bilansRes.data ?? [],
    seances: seancesRes.data ?? [],
    programmes,
    programmeSeances,
    programmePlanning,
    programmeExercices,
    documentsPatient: docsRes.data ?? [],
    seancesPatient,
    exercicesRealises,
  });
});
