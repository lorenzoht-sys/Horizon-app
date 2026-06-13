// GET /api/structure/data
// Renvoie toutes les données du portail structure (participants, bilans,
// programmes, séances, factures de suivi, documents partagés, infos de
// contact du praticien) pour la structure correspondant au token transmis
// dans l'en-tête "x-structure-token". Le token est validé côté serveur
// (clé service_role) et chaque accès est journalisé
// (supabase/migrations/20260613_structure_access_logs.sql).

import { getServiceClient, getClientIp } from '../_lib/patientAuth.js';
import { validateStructureToken, logStructureAccess, getStructureToken } from '../_lib/structureAuth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getStructureToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const structure = await validateStructureToken(supabase, token);
  if (!structure) return res.status(401).json({ error: 'Lien invalide ou structure inactive' });

  await logStructureAccess(supabase, structure.id, getClientIp(req));

  const [praticienRes, participantsRes] = await Promise.all([
    supabase.from('praticiens').select('prenom, nom, titre, email, telephone').eq('id', structure.praticienId).single(),
    supabase.from('participants').select('*, bilans(*), programmes(*)').eq('structure_id', structure.id),
  ]);

  const participants = participantsRes.data ?? [];
  const ids = participants.map((p: any) => p.id);

  let seances: any[] = [];
  let factures: any[] = [];
  let documents: any[] = [];

  if (ids.length > 0) {
    const [seancesRes, facturesRes, documentsRes] = await Promise.all([
      supabase.from('seances').select('*').in('participant_id', ids).order('date', { ascending: false }),
      supabase.from('factures_suivi').select('*').eq('structure_id', structure.id).order('periode_annee', { ascending: false }).order('periode_mois', { ascending: false }),
      supabase.from('documents_partages').select('*').eq('structure_id', structure.id).order('partage_le', { ascending: false }),
    ]);
    seances = seancesRes.data ?? [];
    factures = facturesRes.data ?? [];
    documents = documentsRes.data ?? [];
  }

  return res.status(200).json({
    structure: { id: structure.id, nom: structure.nom, actif: structure.actif, tarifSeance: structure.tarifSeance },
    praticien: praticienRes.data ?? null,
    participants,
    seances,
    factures,
    documents,
  });
}
