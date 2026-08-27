// GET /api/structure/data
// Renvoie toutes les données du portail structure (participants, bilans,
// programmes, séances, factures de suivi, documents partagés, infos de
// contact du praticien) pour la structure correspondant au token transmis
// dans l'en-tête "x-structure-token". Le token est validé côté serveur
// (clé service_role) et chaque accès est journalisé
// (supabase/migrations/20260613_structure_access_logs.sql).

import { getServiceClient, getClientIp } from '../_lib/patientAuth.js';
import { validateStructureToken, logStructureAccess, getStructureToken } from '../_lib/structureAuth.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
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
    // Colonnes explicites (pas select('*')) — même principe que pour
    // `seances` plus bas, appliqué ici à ce qui compte le plus.
    //
    // `select('*')` renvoyait `code_acces` au portail structure. Ce n'est pas
    // une donnée mais un JUSTIFICATIF D'IDENTITÉ : le code ouvre l'espace
    // personnel du bénéficiaire, en ÉCRITURE (valider une séance, soumettre
    // un ressenti), alors que ce portail est en lecture seule. Et il
    // n'expire pas, contrairement au token structure (`expires_at`, [F-04]) :
    // révoquer le lien d'un EHPAD ne révoquait donc pas les accès déjà
    // récupérés. Un lien qui a circulé une fois valait accès permanent à
    // l'espace de chaque bénéficiaire de la structure.
    //
    // Étaient aussi exposés sans usage : `iban`/`bic` (coordonnées bancaires),
    // et tout le dossier médical (`anamnese`, `antecedents_medicaux`,
    // `allergies`, `traitements`, `medecin_traitant`, `pathologie`).
    // Vérifié le 2026-08-27 : `src/pages/PortailStructure.tsx` n'en lit
    // AUCUN — il n'affiche que prénom/nom/date de naissance/date de création,
    // et les bilans/programmes imbriqués. Le suivi que ce portail rend n'a
    // pas besoin du dossier médical.
    //
    // Toute colonne ajoutée ici doit l'être délibérément : ce que voit une
    // structure est ce que voit quiconque détient son lien.
    supabase.from('participants')
      .select('id, prenom, nom, date_naissance, date_creation, structure_id, bilans(*), programmes(*)')
      .eq('structure_id', structure.id),
  ]);

  const participants = participantsRes.data ?? [];
  const ids = participants.map((p: any) => p.id);

  let seances: any[] = [];
  let factures: any[] = [];
  let documents: any[] = [];

  if (ids.length > 0) {
    const [seancesRes, facturesRes, documentsRes] = await Promise.all([
      // Colonnes explicites (pas select('*')) : motif_annulation/
      // motif_annulation_detail sont internes au praticien, jamais exposées
      // au portail structure.
      supabase.from('seances')
        .select('id, participant_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut, notes, adresse, coordonnees, created_at, updated_at')
        .in('participant_id', ids).order('date', { ascending: false }),
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
});
