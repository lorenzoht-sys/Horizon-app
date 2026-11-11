// Lectures et écritures de l'assistant IA : journal des questions, contexte
// du bénéficiaire envoyé au modèle, partage des documents produits.
//
// Les colonnes lues pour le contexte sont listées explicitement : seules
// celles-ci peuvent se retrouver dans un prompt (voir assistantContexte.ts).
import { clientSupabase } from '../supabase';

// ── Journal des questions ────────────────────────────────────────────────
export const listerJournalAssistant = () => clientSupabase()
  .from('assistant_logs')
  .select('id, question, reponse, patient_id, created_at')
  .order('created_at', { ascending: false })
  .limit(50);

export const ajouterJournalAssistant = (ligne: object) => clientSupabase().from('assistant_logs').insert(ligne);

export const supprimerJournalAssistant = (id: string) => clientSupabase().from('assistant_logs').delete().eq('id', id);

// ── Programme actif du bénéficiaire ──────────────────────────────────────
export const lireProgrammeActif = (participantId: string) => clientSupabase()
  .from('programmes')
  .select('*')
  .eq('participant_id', participantId)
  .eq('actif', true)
  .limit(1);

export const lireSeancesProgramme = (programmeId: unknown) =>
  clientSupabase().from('programme_seances').select('*').eq('programme_id', programmeId).order('ordre');

export const lireExercicesProgramme = (seanceIds: string[]) =>
  clientSupabase().from('programme_exercices').select('*').in('seance_id', seanceIds).order('ordre');

export const lirePlanningProgramme = (programmeId: unknown) =>
  clientSupabase().from('programme_planning').select('*').eq('programme_id', programmeId);

// ── Contexte de suivi ────────────────────────────────────────────────────
export const lireComptesRendusRecents = (participantId: string) => clientSupabase()
  .from('comptes_rendus_seances')
  .select('date_seance, observations, progression, points_attention, douleurs_signalees')
  .eq('participant_id', participantId).order('date_seance', { ascending: false }).limit(5);

export const lireSeancesPatientRecentes = (participantId: string) => clientSupabase()
  .from('seances_patient')
  .select('id, date_seance, commentaire_patient')
  .eq('participant_id', participantId).order('date_seance', { ascending: false }).limit(30);

export const lireNotesRecentes = (participantId: string) => clientSupabase()
  .from('notes_seances')
  .select('date, ressenti, note, alertes, douleur_eva')
  .eq('participant_id', participantId).order('date', { ascending: false }).limit(5);

// motif_annulation / motif_annulation_detail sont internes au praticien : jamais lus ici.
export const lireSeancesPlanifieesDepuis = (participantId: string, dateISO: string) => clientSupabase()
  .from('seances')
  .select('date, statut')
  .eq('participant_id', participantId).eq('type', 'seance').gte('date', dateISO);

export const lireExercicesRealises = (seancePatientIds: readonly unknown[]) => clientSupabase()
  .from('exercices_realises')
  .select('seance_patient_id, realise')
  .in('seance_patient_id', seancePatientIds);

// ── Partage des documents produits ───────────────────────────────────────
export const partagerAvecBeneficiaire = (ligne: object) => clientSupabase().from('documents_patient').insert(ligne);

export const partagerAvecStructure = (ligne: object) => clientSupabase().from('documents_partages').insert(ligne);
