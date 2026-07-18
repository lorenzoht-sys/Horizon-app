import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import type {
  ProgrammeModele, ModeleSeance, ModeleExercice,
  ModelePlanning, TypeProgramme, JourProgramme,
} from '../types';

// ── Mappers DB → TS ──────────────────────────────────────────────────────────

function rowToModeleExercice(row: Record<string, unknown>): ModeleExercice {
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

function rowToModeleSeance(row: Record<string, unknown>, exercices: ModeleExercice[]): ModeleSeance {
  return {
    id: row.id as string,
    modeleId: row.modele_id as string,
    nom: (row.nom as string) ?? '',
    description: (row.description as string | null) ?? undefined,
    ordre: (row.ordre as number) ?? 0,
    exercices,
  };
}

function rowToModelePlanning(row: Record<string, unknown>): ModelePlanning {
  return {
    id: row.id as string,
    modeleId: row.modele_id as string,
    seanceId: row.seance_id as string,
    jour: row.jour as JourProgramme,
  };
}

function rowToProgrammeModele(
  row: Record<string, unknown>,
  seances: ModeleSeance[],
  planning: ModelePlanning[],
): ProgrammeModele {
  return {
    id: row.id as string,
    nom: (row.nom as string) ?? '',
    objectif: (row.objectif as string | null) ?? undefined,
    messageMotivation: (row.message_motivation as string | null) ?? undefined,
    type: ((row.type as TypeProgramme | null) ?? 'domicile') as TypeProgramme,
    createdAt: (row.created_at as string | null) ?? '',
    seances,
    planning,
    objectifSeancesAutonomes: (row.objectif_seances_autonomes as number | null) ?? undefined,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface ProgrammeModeleFormData {
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

export function useProgrammesModeles() {
  const [modeles, setModeles] = useState<ProgrammeModele[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);

    // RLS scope déjà à praticien_id = auth.uid(), pas de filtre applicatif nécessaire.
    const { data: modeleRows } = await supabase
      .from('programmes_modeles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!modeleRows || modeleRows.length === 0) { setModeles([]); setLoading(false); return; }

    const [seancesRes, planningRes] = await Promise.all([
      supabase.from('programme_modele_seances').select('*').in('modele_id', modeleRows.map(m => m.id)).order('ordre'),
      supabase.from('programme_modele_planning').select('*').in('modele_id', modeleRows.map(m => m.id)),
    ]);

    const allSeanceRows = (seancesRes.data ?? []) as Record<string, unknown>[];
    const allPlanningRows = (planningRes.data ?? []) as Record<string, unknown>[];

    let allExerciceRows: Record<string, unknown>[] = [];
    if (allSeanceRows.length > 0) {
      const { data: exRows } = await supabase
        .from('programme_modele_exercices')
        .select('*')
        .in('seance_id', allSeanceRows.map(s => s.id as string))
        .order('ordre');
      allExerciceRows = (exRows ?? []) as Record<string, unknown>[];
    }

    const full = modeleRows.map(modeleRow => {
      const seanceRows = allSeanceRows.filter(s => s.modele_id === modeleRow.id);
      const planningRows = allPlanningRows.filter(p => p.modele_id === modeleRow.id);

      const seances = seanceRows.map(seanceRow => {
        const exerciceRows = allExerciceRows.filter(e => e.seance_id === seanceRow.id);
        const exercices = exerciceRows.map(rowToModeleExercice);
        return rowToModeleSeance(seanceRow, exercices);
      });

      const planning = planningRows.map(rowToModelePlanning);

      return rowToProgrammeModele(modeleRow as Record<string, unknown>, seances, planning);
    });

    setModeles(full);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────

  const createModele = useCallback(async (data: ProgrammeModeleFormData): Promise<boolean> => {
    if (!supabase) return false;

    const modeleId = uuidv4();

    const { error: modeleError } = await supabase.from('programmes_modeles').insert({
      id: modeleId,
      nom: data.nom,
      objectif: data.objectif ?? null,
      objectif_seances_autonomes: data.objectifSeancesAutonomes ?? null,
      message_motivation: data.messageMotivation ?? null,
      type: data.type,
    });
    if (modeleError) { console.error('Erreur création modèle:', modeleError); return false; }

    const tempIdToRealId: Record<string, string> = {};
    for (let i = 0; i < data.seances.length; i++) {
      const seance = data.seances[i];
      const seanceId = uuidv4();
      tempIdToRealId[seance.tempId] = seanceId;

      const { error: seanceError } = await supabase.from('programme_modele_seances').insert({
        id: seanceId,
        modele_id: modeleId,
        nom: seance.nom,
        description: seance.description ?? null,
        ordre: i + 1,
      });
      if (seanceError) { console.error('Erreur création séance modèle:', seanceError); }

      for (let j = 0; j < seance.exercices.length; j++) {
        const ex = seance.exercices[j];
        const { error: exError } = await supabase.from('programme_modele_exercices').insert({
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
        if (exError) { console.error('Erreur création exercice modèle:', exError); }
      }
    }

    const JOURS: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    for (const jour of JOURS) {
      const tempId = data.planning[jour];
      if (!tempId) continue;
      const seanceId = tempIdToRealId[tempId];
      if (!seanceId) continue;
      const { error: planError } = await supabase.from('programme_modele_planning').insert({
        id: uuidv4(),
        modele_id: modeleId,
        seance_id: seanceId,
        jour,
      });
      if (planError) { console.error('Erreur création planning modèle:', planError); }
    }

    await load();
    return true;
  }, [load]);

  // ── Update ───────────────────────────────────────────────────────────────────

  const updateModele = useCallback(async (id: string, data: ProgrammeModeleFormData): Promise<boolean> => {
    if (!supabase) return false;

    const { error: modeleError } = await supabase.from('programmes_modeles').update({
      nom: data.nom,
      objectif: data.objectif ?? null,
      objectif_seances_autonomes: data.objectifSeancesAutonomes ?? null,
      message_motivation: data.messageMotivation ?? null,
      type: data.type,
    }).eq('id', id);
    if (modeleError) { console.error('Erreur update modèle:', modeleError); return false; }

    const { data: existingSeances } = await supabase
      .from('programme_modele_seances').select('id').eq('modele_id', id);
    if (existingSeances && existingSeances.length > 0) {
      await supabase.from('programme_modele_exercices')
        .delete().in('seance_id', existingSeances.map(s => s.id));
    }

    await supabase.from('programme_modele_planning').delete().eq('modele_id', id);
    await supabase.from('programme_modele_seances').delete().eq('modele_id', id);

    const tempIdToRealId: Record<string, string> = {};
    for (let i = 0; i < data.seances.length; i++) {
      const seance = data.seances[i];
      const seanceId = uuidv4();
      tempIdToRealId[seance.tempId] = seanceId;

      await supabase.from('programme_modele_seances').insert({
        id: seanceId, modele_id: id, nom: seance.nom,
        description: seance.description ?? null, ordre: i + 1,
      });

      for (let j = 0; j < seance.exercices.length; j++) {
        const ex = seance.exercices[j];
        await supabase.from('programme_modele_exercices').insert({
          id: uuidv4(), seance_id: seanceId, nom: ex.nom,
          categorie: ex.categorie ?? null, description: ex.description ?? null,
          conseil_securite: ex.conseilSecurite ?? null,
          series: ex.series ?? null, repetitions: ex.repetitions ?? null,
          duree_secondes: ex.dureeSecondes ?? null, ordre: j + 1,
        });
      }
    }

    const JOURS: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    for (const jour of JOURS) {
      const tempId = data.planning[jour];
      if (!tempId) continue;
      const seanceId = tempIdToRealId[tempId];
      if (!seanceId) continue;
      await supabase.from('programme_modele_planning').insert({
        id: uuidv4(), modele_id: id, seance_id: seanceId, jour,
      });
    }

    await load();
    return true;
  }, [load]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const deleteModele = useCallback(async (id: string) => {
    if (!supabase) return;
    // Cascade gère seances, planning, exercices.
    await supabase.from('programmes_modeles').delete().eq('id', id);
    setModeles(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Appliquer à un bénéficiaire ────────────────────────────────────────────
  // Un seul appel réseau : toute la copie en profondeur se fait dans la
  // fonction Postgres dupliquer_programme_modele (transaction unique).

  const appliquerModele = useCallback(async (modeleId: string, participantId: string): Promise<string | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('dupliquer_programme_modele', {
      p_modele_id: modeleId,
      p_participant_id: participantId,
    });
    if (error) { console.error('Erreur application du modèle:', error); return null; }
    return (data as string) ?? null;
  }, []);

  return {
    modeles,
    loading,
    createModele,
    updateModele,
    deleteModele,
    appliquerModele,
    reload: load,
  };
}
