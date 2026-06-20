import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import type {
  ProgrammeV2, ProgrammeSeanceV2, ProgrammeExerciceV2,
  ProgrammePlanningV2, TypeProgramme, JourProgramme,
} from '../types';

// ── Mappers DB → TS ──────────────────────────────────────────────────────────

function rowToExercice(row: Record<string, unknown>): ProgrammeExerciceV2 {
  return {
    id: row.id as string,
    seanceId: row.seance_id as string,
    nom: (row.nom as string) ?? '',
    categorie: (row.categorie as string | null) ?? undefined,
    description: (row.description as string | null) ?? undefined,
    conseilSecurite: (row.conseil_securite as string | null) ?? undefined,
    series: (row.series as number | null) ?? undefined,
    repetitions: (row.repetitions as number | null) ?? undefined,
    dureeSecondes: (row.duree_secondes as number | null) ?? undefined,
    ordre: (row.ordre as number) ?? 0,
  };
}

function rowToSeance(row: Record<string, unknown>, exercices: ProgrammeExerciceV2[]): ProgrammeSeanceV2 {
  return {
    id: row.id as string,
    programmeId: row.programme_id as string,
    nom: (row.nom as string) ?? '',
    description: (row.description as string | null) ?? undefined,
    ordre: (row.ordre as number) ?? 0,
    exercices,
  };
}

function rowToPlanning(row: Record<string, unknown>): ProgrammePlanningV2 {
  return {
    id: row.id as string,
    programmeId: row.programme_id as string,
    seanceId: row.seance_id as string,
    jour: row.jour as JourProgramme,
  };
}

function rowToProgrammeV2(
  row: Record<string, unknown>,
  seances: ProgrammeSeanceV2[],
  planning: ProgrammePlanningV2[],
): ProgrammeV2 {
  return {
    id: row.id as string,
    participantId: row.participant_id as string,
    nom: (row.nom as string | null) ?? (row.titre as string | null) ?? '',
    objectif: (row.objectif as string | null) ?? undefined,
    messageMotivation: (row.message_motivation as string | null) ?? undefined,
    type: ((row.type as TypeProgramme | null) ?? 'domicile') as TypeProgramme,
    actif: (row.actif as boolean) ?? true,
    createdAt: (row.created_at as string | null) ?? (row.date_creation as string | null) ?? '',
    seances,
    planning,
    objectifSeancesAutonomes: (row.objectif_seances_autonomes as number | null) ?? undefined,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface SeancesAutonomesStats {
  count: number;
  dates: string[];
}

export function useProgrammeV2(participantId: string) {
  const [programmes, setProgrammes] = useState<ProgrammeV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [seancesAutonomesStats, setSeancesAutonomesStats] = useState<Record<string, SeancesAutonomesStats>>({});

  const load = useCallback(async () => {
    if (!participantId || !supabase) { setLoading(false); return; }
    setLoading(true);

    // Load programmes that have the 'type' column set (= V2 programmes)
    const { data: progRows } = await supabase
      .from('programmes')
      .select('*')
      .eq('participant_id', participantId)
      .not('type', 'is', null)
      .order('created_at', { ascending: false });

    if (!progRows || progRows.length === 0) { setProgrammes([]); setSeancesAutonomesStats({}); setLoading(false); return; }

    // Load seances + planning for all programmes in parallel
    const [seancesRes, planningRes] = await Promise.all([
      supabase.from('programme_seances').select('*').in('programme_id', progRows.map(p => p.id)).order('ordre'),
      supabase.from('programme_planning').select('*').in('programme_id', progRows.map(p => p.id)),
    ]);

    const allSeanceRows = (seancesRes.data ?? []) as Record<string, unknown>[];
    const allPlanningRows = (planningRes.data ?? []) as Record<string, unknown>[];

    // Load exercices for all seances in parallel
    let allExerciceRows: Record<string, unknown>[] = [];
    if (allSeanceRows.length > 0) {
      const { data: exRows } = await supabase
        .from('programme_exercices')
        .select('*')
        .in('seance_id', allSeanceRows.map(s => s.id as string))
        .order('ordre');
      allExerciceRows = (exRows ?? []) as Record<string, unknown>[];
    }

    // Assemble full programmes
    const fullProgs = progRows.map(progRow => {
      const seanceRows = allSeanceRows.filter(s => s.programme_id === progRow.id);
      const planningRows = allPlanningRows.filter(p => p.programme_id === progRow.id);

      const seances = seanceRows.map(seanceRow => {
        const exerciceRows = allExerciceRows.filter(e => e.seance_id === seanceRow.id);
        const exercices = exerciceRows.map(rowToExercice);
        return rowToSeance(seanceRow, exercices);
      });

      const planning = planningRows.map(rowToPlanning);

      return rowToProgrammeV2(progRow as Record<string, unknown>, seances, planning);
    });

    setProgrammes(fullProgs);

    // Assiduité autonome : décompte + dates de validation par programme,
    // pour la progression "X / objectif" côté praticien.
    const { data: spRows } = await supabase
      .from('seances_patient')
      .select('programme_id, date_seance')
      .in('programme_id', progRows.map(p => p.id))
      .order('date_seance', { ascending: false });

    const stats: Record<string, SeancesAutonomesStats> = {};
    for (const row of (spRows ?? []) as { programme_id: string; date_seance: string }[]) {
      const entry = stats[row.programme_id] ?? { count: 0, dates: [] };
      entry.count += 1;
      if (entry.dates.length < 8) entry.dates.push(row.date_seance);
      stats[row.programme_id] = entry;
    }
    setSeancesAutonomesStats(stats);

    setLoading(false);
  }, [participantId]);

  useEffect(() => { void load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────

  const createProgramme = useCallback(async (data: {
    nom: string;
    objectif?: string;
    objectifSeancesAutonomes?: number;
    messageMotivation?: string;
    type: TypeProgramme;
    seances: Array<{
      tempId: string;
      nom: string;
      description?: string;
      exercices: Array<{
        nom: string;
        categorie?: string;
        description?: string;
        conseilSecurite?: string;
        series?: number;
        repetitions?: number;
        dureeSecondes?: number;
      }>;
    }>;
    planning: Partial<Record<JourProgramme, string | null>>;
  }): Promise<boolean> => {
    if (!supabase) return false;

    const progId = uuidv4();

    // 1. Create programme
    const { error: progError } = await supabase.from('programmes').insert({
      id: progId,
      participant_id: participantId,
      nom: data.nom,
      titre: data.nom, // backward compat with old hook
      objectif: data.objectif ?? null,
      objectif_seances_autonomes: data.objectifSeancesAutonomes ?? null,
      message_motivation: data.messageMotivation ?? null,
      type: data.type,
      actif: true,
      date_creation: new Date().toISOString().slice(0, 10),
      date_debut: new Date().toISOString().slice(0, 10),
      exercices: [],
      suivi_semaines: [],
    });
    if (progError) { console.error('Erreur création programme:', progError); return false; }

    // 2. Create seances + exercices
    const tempIdToRealId: Record<string, string> = {};
    for (let i = 0; i < data.seances.length; i++) {
      const seance = data.seances[i];
      const seanceId = uuidv4();
      tempIdToRealId[seance.tempId] = seanceId;

      const { error: seanceError } = await supabase.from('programme_seances').insert({
        id: seanceId,
        programme_id: progId,
        nom: seance.nom,
        description: seance.description ?? null,
        ordre: i + 1,
      });
      if (seanceError) { console.error('Erreur création séance:', seanceError); }

      for (let j = 0; j < seance.exercices.length; j++) {
        const ex = seance.exercices[j];
        const { error: exError } = await supabase.from('programme_exercices').insert({
          id: uuidv4(),
          seance_id: seanceId,
          nom: ex.nom,
          categorie: ex.categorie ?? null,
          description: ex.description ?? null,
          conseil_securite: ex.conseilSecurite ?? null,
          series: ex.series ?? null,
          repetitions: ex.repetitions ?? null,
          duree_secondes: ex.dureeSecondes ?? null,
          ordre: j + 1,
        });
        if (exError) { console.error('Erreur création exercice:', exError); }
      }
    }

    // 3. Create planning
    const JOURS: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    for (const jour of JOURS) {
      const tempId = data.planning[jour];
      if (!tempId) continue;
      const seanceId = tempIdToRealId[tempId];
      if (!seanceId) continue;
      const { error: planError } = await supabase.from('programme_planning').insert({
        id: uuidv4(),
        programme_id: progId,
        seance_id: seanceId,
        jour,
      });
      if (planError) { console.error('Erreur création planning:', planError); }
    }

    await load();
    return true;
  }, [participantId, load]);

  // ── Update ───────────────────────────────────────────────────────────────────

  const updateProgramme = useCallback(async (
    id: string,
    data: {
      nom: string;
      objectif?: string;
      objectifSeancesAutonomes?: number;
      messageMotivation?: string;
      type: TypeProgramme;
      seances: Array<{
        tempId: string;
        nom: string;
        description?: string;
        exercices: Array<{
          nom: string;
          categorie?: string;
          description?: string;
          conseilSecurite?: string;
          series?: number;
          repetitions?: number;
          dureeSecondes?: number;
        }>;
      }>;
      planning: Partial<Record<JourProgramme, string | null>>;
    }
  ): Promise<boolean> => {
    if (!supabase) return false;

    // 1. Mettre à jour les infos du programme
    const { error: progError } = await supabase.from('programmes').update({
      nom: data.nom,
      titre: data.nom,
      objectif: data.objectif ?? null,
      objectif_seances_autonomes: data.objectifSeancesAutonomes ?? null,
      message_motivation: data.messageMotivation ?? null,
      type: data.type,
    }).eq('id', id);
    if (progError) { console.error('Erreur update programme:', progError); return false; }

    // 2. Récupérer les IDs des séances existantes pour supprimer leurs exercices
    const { data: existingSeances } = await supabase
      .from('programme_seances').select('id').eq('programme_id', id);
    if (existingSeances && existingSeances.length > 0) {
      await supabase.from('programme_exercices')
        .delete().in('seance_id', existingSeances.map(s => s.id));
    }

    // 3. Supprimer planning et séances existants
    await supabase.from('programme_planning').delete().eq('programme_id', id);
    await supabase.from('programme_seances').delete().eq('programme_id', id);

    // 4. Re-créer séances + exercices
    const tempIdToRealId: Record<string, string> = {};
    for (let i = 0; i < data.seances.length; i++) {
      const seance = data.seances[i];
      const seanceId = uuidv4();
      tempIdToRealId[seance.tempId] = seanceId;

      await supabase.from('programme_seances').insert({
        id: seanceId, programme_id: id, nom: seance.nom,
        description: seance.description ?? null, ordre: i + 1,
      });

      for (let j = 0; j < seance.exercices.length; j++) {
        const ex = seance.exercices[j];
        await supabase.from('programme_exercices').insert({
          id: uuidv4(), seance_id: seanceId, nom: ex.nom,
          categorie: ex.categorie ?? null, description: ex.description ?? null,
          conseil_securite: ex.conseilSecurite ?? null,
          series: ex.series ?? null, repetitions: ex.repetitions ?? null,
          duree_secondes: ex.dureeSecondes ?? null, ordre: j + 1,
        });
      }
    }

    // 5. Re-créer le planning
    const JOURS: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    for (const jour of JOURS) {
      const tempId = data.planning[jour];
      if (!tempId) continue;
      const seanceId = tempIdToRealId[tempId];
      if (!seanceId) continue;
      await supabase.from('programme_planning').insert({
        id: uuidv4(), programme_id: id, seance_id: seanceId, jour,
      });
    }

    await load();
    return true;
  }, [load]);

  // ── Toggle actif ─────────────────────────────────────────────────────────────

  const toggleActif = useCallback(async (id: string, actif: boolean) => {
    if (!supabase) return;
    await supabase.from('programmes').update({ actif }).eq('id', id);
    setProgrammes(prev => prev.map(p => p.id === id ? { ...p, actif } : p));
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const deleteProgrammeV2 = useCallback(async (id: string) => {
    if (!supabase) return;
    // Cascade handles seances, planning, exercices
    await supabase.from('programmes').delete().eq('id', id);
    setProgrammes(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getSeancesAujourdHui(prog: ProgrammeV2): ProgrammeSeanceV2[] {
    const todayFR = new Date().toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase() as JourProgramme;
    const seanceIds = prog.planning.filter(p => p.jour === todayFR).map(p => p.seanceId);
    return prog.seances.filter(s => seanceIds.includes(s.id));
  }

  function getJoursSemaine(prog: ProgrammeV2): JourProgramme[] {
    const jours = new Set(prog.planning.map(p => p.jour));
    const ordre: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    return ordre.filter(j => jours.has(j));
  }

  function countExercices(prog: ProgrammeV2): number {
    const seanceIds = new Set(prog.planning.map(p => p.seanceId));
    const seances = prog.seances.filter(s => seanceIds.has(s.id));
    return seances.length > 0 ? Math.max(...seances.map(s => s.exercices.length)) : 0;
  }

  return {
    programmes,
    loading,
    seancesAutonomesStats,
    createProgramme,
    updateProgramme,
    toggleActif,
    deleteProgrammeV2,
    reload: load,
    getSeancesAujourdHui,
    getJoursSemaine,
    countExercices,
  };
}
