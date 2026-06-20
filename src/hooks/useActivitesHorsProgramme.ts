import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Exercice } from '../types';

export interface TestEtalonResultatRow {
  testId: string;
  valeur: number;
  dateTest: string;
}

export interface ExerciceLibreActivationRow {
  id: string;
  exerciceId: string;
  nom: string;
  description: string | null;
  consigneSecurite: string | null;
  categorie: string | null;
  actif: boolean;
}

export interface ExerciceLibreValidationRow {
  exerciceId: string;
  date: string;
  fait: boolean;
}

// Gère les deux activités hors programme (tests étalons chronométrés +
// exercices libres assignés à un patient), distinctes du programme structuré.
// Rien n'est visible côté patient sans activation explicite ici.
export function useActivitesHorsProgramme(participantId: string) {
  const [praticienId, setPraticienId] = useState<string | null>(null);
  const [testsActivations, setTestsActivations] = useState<Record<string, boolean>>({});
  const [testsResultats, setTestsResultats] = useState<TestEtalonResultatRow[]>([]);
  const [exercicesActivations, setExercicesActivations] = useState<ExerciceLibreActivationRow[]>([]);
  const [exercicesValidations, setExercicesValidations] = useState<ExerciceLibreValidationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setPraticienId(user.id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!participantId || !supabase) { setLoading(false); return; }
    setLoading(true);

    const [testsActRes, testsResRes, exActRes, exValRes] = await Promise.all([
      supabase.from('tests_etalons_activations').select('test_id, actif').eq('participant_id', participantId),
      supabase.from('tests_etalons_resultats').select('test_id, valeur, date_test').eq('participant_id', participantId).order('date_test'),
      supabase.from('exercices_libres_activations').select('id, exercice_id, nom, description, consigne_securite, categorie, actif').eq('participant_id', participantId),
      supabase.from('exercices_libres_validations').select('exercice_id, date, fait').eq('participant_id', participantId).order('date', { ascending: false }),
    ]);

    const actMap: Record<string, boolean> = {};
    for (const row of testsActRes.data ?? []) actMap[(row as any).test_id] = (row as any).actif;
    setTestsActivations(actMap);

    setTestsResultats((testsResRes.data ?? []).map((r: any) => ({
      testId: r.test_id, valeur: r.valeur, dateTest: r.date_test,
    })));

    setExercicesActivations((exActRes.data ?? []).map((r: any) => ({
      id: r.id, exerciceId: r.exercice_id, nom: r.nom,
      description: r.description, consigneSecurite: r.consigne_securite,
      categorie: r.categorie, actif: r.actif,
    })));

    setExercicesValidations((exValRes.data ?? []).map((r: any) => ({
      exerciceId: r.exercice_id, date: r.date, fait: r.fait,
    })));

    setLoading(false);
  }, [participantId]);

  useEffect(() => { void load(); }, [load]);

  const toggleTestEtalon = useCallback(async (testId: string, actif: boolean) => {
    if (!supabase || !praticienId) return;
    await supabase.from('tests_etalons_activations').upsert({
      participant_id: participantId, test_id: testId, praticien_id: praticienId, actif,
    }, { onConflict: 'participant_id,test_id' });
    setTestsActivations(prev => ({ ...prev, [testId]: actif }));
  }, [participantId, praticienId]);

  const assignerExerciceLibre = useCallback(async (ex: Exercice) => {
    if (!supabase || !praticienId) return;
    await supabase.from('exercices_libres_activations').upsert({
      participant_id: participantId,
      exercice_id: ex.id,
      praticien_id: praticienId,
      nom: ex.nom,
      description: ex.description ?? null,
      consigne_securite: ex.consigneSecurite ?? null,
      categorie: ex.categorie ?? null,
      actif: true,
    }, { onConflict: 'participant_id,exercice_id' });
    await load();
  }, [participantId, praticienId, load]);

  const toggleExerciceLibre = useCallback(async (exerciceId: string, actif: boolean) => {
    if (!supabase) return;
    await supabase.from('exercices_libres_activations').update({ actif })
      .eq('participant_id', participantId).eq('exercice_id', exerciceId);
    setExercicesActivations(prev => prev.map(e => e.exerciceId === exerciceId ? { ...e, actif } : e));
  }, [participantId]);

  return {
    loading,
    testsActivations,
    testsResultats,
    exercicesActivations,
    exercicesValidations,
    toggleTestEtalon,
    assignerExerciceLibre,
    toggleExerciceLibre,
  };
}
