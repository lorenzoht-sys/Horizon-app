// Lecture du suivi d'un bénéficiaire côté praticien : séances réalisées,
// assiduité, ressentis après séance, appareils abonnés aux rappels.
//
// ── Pourquoi ce module (2026-11-10, fiabilisation lot 2) ────────────────
// Ces requêtes vivaient dans les pages (Dashboard, ParticipantProfile), en
// partie dupliquées. Les regrouper ici a deux effets : la règle « ressentis
// préoccupants » n'existe plus qu'à un endroit, testé ; et pour la migration
// HDS, changer de source de données se fait ici, pas dans des écrans de
// 2 000 lignes. Les pages ne gardent que l'affichage.
import { supabase } from './supabase';
import { enLots } from './lots';

export interface RetourSeance {
  id: string;
  date: string;
  borgRpe: number;
  bienEtre: number;
}

export interface SeancePatientStat {
  id: string;
  seanceId: string;
  programmeId: string;
  dateSeance: string;
  statut: string;
  commentairePatient: string | null;
  dureeMinutes: number | null;
  nbRealises: number;
  nbTotal: number;
}

export interface AssiduiteBeneficiaire {
  nb: number;
  taux: number | null;
  derniere: string | null;
}

interface ExerciceRealise { seance_patient_id: string; realise: boolean }

/**
 * Règle d'alerte « à surveiller » : sur les 3 derniers retours (du plus
 * récent au plus ancien), effort toujours ≥ 8 (Borg) OU bien-être toujours
 * ≥ 4 (fatigué / épuisé). Moins de 3 retours : pas d'alerte.
 */
export function ressentisPreoccupants(retours: readonly { borgRpe: number; bienEtre: number }[]): boolean {
  if (retours.length < 3) return false;
  const last3 = retours.slice(0, 3);
  return last3.every(r => r.borgRpe >= 8) || last3.every(r => r.bienEtre >= 4);
}

/** Assiduité par bénéficiaire à partir des séances et de leurs exercices cochés. */
export function agregerAssiduite(
  seances: readonly { id: string; participantId: string; date: string }[],
  exercices: readonly ExerciceRealise[],
): Record<string, AssiduiteBeneficiaire> {
  const parBeneficiaire: Record<string, { spId: string; date: string }[]> = {};
  for (const sp of seances) {
    if (!parBeneficiaire[sp.participantId]) parBeneficiaire[sp.participantId] = [];
    parBeneficiaire[sp.participantId].push({ spId: sp.id, date: sp.date });
  }
  const resultat: Record<string, AssiduiteBeneficiaire> = {};
  for (const [pid, sessions] of Object.entries(parBeneficiaire)) {
    const ids = new Set(sessions.map(s => s.spId));
    const items = exercices.filter(e => ids.has(e.seance_patient_id));
    const realises = items.filter(e => e.realise).length;
    const derniere = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;
    resultat[pid] = {
      nb: sessions.length,
      taux: items.length > 0 ? Math.round((realises / items.length) * 100) : null,
      derniere,
    };
  }
  return resultat;
}

// Par lots : la liste d'identifiants part dans l'URL, PostgREST refuse la
// requête (400) quand elle devient trop longue.
async function chargerExercicesRealises(seancePatientIds: string[]): Promise<ExerciceRealise[]> {
  if (!supabase || seancePatientIds.length === 0) return [];
  const client = supabase;
  const reponses = await Promise.all(enLots(seancePatientIds).map(lot => client
    .from('exercices_realises')
    .select('seance_patient_id, realise')
    .in('seance_patient_id', lot)));
  return reponses.flatMap(r => (r.data ?? []) as unknown as ExerciceRealise[]);
}

/** Assiduité des 7 derniers jours, tous bénéficiaires du praticien (tableau de bord). */
export async function chargerAssiduite7Jours(): Promise<Record<string, AssiduiteBeneficiaire>> {
  if (!supabase) return {};
  const j7 = new Date(); j7.setDate(j7.getDate() - 7);
  const isoJ7 = j7.toISOString().split('T')[0];
  const { data } = await supabase.from('seances_patient')
    .select('id, participant_id, date_seance')
    .gte('date_seance', isoJ7)
    .order('date_seance', { ascending: false });
  const lignes = (data ?? []) as unknown as { id: string; participant_id: string; date_seance: string }[];
  if (lignes.length === 0) return {};
  const exercices = await chargerExercicesRealises(lignes.map(s => s.id));
  return agregerAssiduite(
    lignes.map(s => ({ id: s.id, participantId: s.participant_id, date: s.date_seance })),
    exercices,
  );
}

/** Ressentis récents de plusieurs bénéficiaires, du plus récent au plus ancien pour chacun. */
export async function chargerRetoursParBeneficiaire(
  participantIds: string[],
): Promise<Record<string, { borgRpe: number; bienEtre: number }[]>> {
  if (!supabase || participantIds.length === 0) return {};
  const client = supabase;
  // Chaque bénéficiaire est dans un seul lot : l'ordre par date de ses
  // retours est conservé.
  const reponses = await Promise.all(enLots(participantIds).map(lot => client
    .from('retours_seance')
    .select('participant_id, borg_rpe, bien_etre')
    .in('participant_id', lot)
    .order('date', { ascending: false })));
  const parBeneficiaire: Record<string, { borgRpe: number; bienEtre: number }[]> = {};
  for (const r of reponses.flatMap(x => (x.data ?? []) as unknown as { participant_id: string; borg_rpe: number; bien_etre: number }[])) {
    if (!parBeneficiaire[r.participant_id]) parBeneficiaire[r.participant_id] = [];
    parBeneficiaire[r.participant_id].push({ borgRpe: r.borg_rpe, bienEtre: r.bien_etre });
  }
  return parBeneficiaire;
}

/** 30 derniers ressentis d'un bénéficiaire. null si la lecture a échoué. */
export async function chargerRetoursSeance(participantId: string): Promise<RetourSeance[] | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('retours_seance')
    .select('id, date, borg_rpe, bien_etre')
    .eq('participant_id', participantId)
    .order('date', { ascending: false })
    .limit(30);
  if (!data) return null;
  return (data as unknown as { id: string; date: string; borg_rpe: number; bien_etre: number }[]).map(r => ({
    id: r.id,
    date: r.date,
    borgRpe: r.borg_rpe,
    bienEtre: r.bien_etre,
  }));
}

/** 30 dernières séances réalisées par un bénéficiaire, avec le nombre d'exercices cochés. */
export async function chargerSeancesStats(participantId: string): Promise<SeancePatientStat[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('seances_patient')
    .select('id, seance_id, programme_id, date_seance, statut, commentaire_patient, duree_minutes')
    .eq('participant_id', participantId)
    .order('date_seance', { ascending: false })
    .limit(30);
  const lignes = (data ?? []) as unknown as {
    id: string; seance_id: string; programme_id: string; date_seance: string; statut: string;
    commentaire_patient: string | null; duree_minutes: number | null;
  }[];
  if (lignes.length === 0) return [];
  const exercices = await chargerExercicesRealises(lignes.map(s => s.id));
  return lignes.map(sp => {
    const items = exercices.filter(e => e.seance_patient_id === sp.id);
    return {
      id: sp.id,
      seanceId: sp.seance_id,
      programmeId: sp.programme_id,
      dateSeance: sp.date_seance,
      statut: sp.statut,
      commentairePatient: sp.commentaire_patient ?? null,
      dureeMinutes: sp.duree_minutes ?? null,
      nbRealises: items.filter(e => e.realise).length,
      nbTotal: items.length,
    };
  });
}

/** Nombre d'appareils du bénéficiaire abonnés aux rappels. null si Supabase n'est pas configuré. */
export async function compterAppareilsRappels(participantId: string): Promise<number | null> {
  if (!supabase) return null;
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', participantId);
  return count ?? 0;
}
