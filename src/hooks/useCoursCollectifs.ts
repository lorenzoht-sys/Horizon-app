import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { CoursCollectif, ParticipationCoursCollectif, StatutCoursCollectif, StatutPresenceCours } from '../types';
import { supabase } from '../lib/supabase';
import {
  dbToCoursCollectif, coursCollectifToDb,
  dbToParticipationCoursCollectif, participationCoursCollectifToDb,
} from '../lib/mappers';

interface CreerCoursCollectifData {
  structureId?: string;
  titre: string;
  date: string;
  heureDebut: string;
  dureeMinutes: number;
  programmeCommunId?: string;
  modeFacturation: 'structure' | 'individuel';
  participantIds: string[];
}

// Chargement eager des deux tables (cours + participations) : l'agenda a
// besoin de l'ensemble pour afficher le nombre de participants par carte,
// même pattern que useContrats.ts (liste complète chargée une fois).
export function useCoursCollectifs() {
  const [coursCollectifs, setCoursCollectifs] = useState<CoursCollectif[]>([]);
  const [participations, setParticipations] = useState<ParticipationCoursCollectif[]>([]);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [coursRes, partRes] = await Promise.all([
      supabase.from('cours_collectifs').select('*').order('date', { ascending: false }),
      supabase.from('participations_cours_collectifs').select('*'),
    ]);
    if (coursRes.error) console.error('Erreur chargement cours collectifs:', coursRes.error);
    if (partRes.error) console.error('Erreur chargement participations cours collectifs:', partRes.error);
    setCoursCollectifs((coursRes.data ?? []).map(dbToCoursCollectif));
    setParticipations((partRes.data ?? []).map(dbToParticipationCoursCollectif));
    setLoading(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function creerCoursCollectif(data: CreerCoursCollectifData): Promise<CoursCollectif | null> {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const cours: CoursCollectif = {
      id: uuidv4(),
      praticienId: user.id,
      structureId: data.structureId,
      titre: data.titre,
      date: data.date,
      heureDebut: data.heureDebut,
      dureeMinutes: data.dureeMinutes,
      programmeCommunId: data.programmeCommunId,
      modeFacturation: data.modeFacturation,
      statut: 'planifie',
      createdAt: new Date().toISOString(),
    };
    const { error: errCours } = await supabase.from('cours_collectifs').insert(coursCollectifToDb(cours));
    if (errCours) {
      console.error('Erreur création cours collectif:', errCours);
      toast.error('Erreur : ' + errCours.message);
      return null;
    }

    const nouvellesParticipations: ParticipationCoursCollectif[] = data.participantIds.map(participantId => ({
      id: uuidv4(),
      coursId: cours.id,
      participantId,
      statutPresence: 'present',
      createdAt: new Date().toISOString(),
    }));
    if (nouvellesParticipations.length > 0) {
      const { error: errPart } = await supabase
        .from('participations_cours_collectifs')
        .insert(nouvellesParticipations.map(participationCoursCollectifToDb));
      if (errPart) {
        console.error('Erreur création participations cours collectif:', errPart);
        toast.error('Erreur : ' + errPart.message);
        // Le cours existe déjà en base sans participants — mieux vaut le
        // signaler dans la liste locale que le faire disparaître alors
        // qu'il est bien créé côté serveur.
        setCoursCollectifs(prev => [cours, ...prev]);
        return cours;
      }
      setParticipations(prev => [...prev, ...nouvellesParticipations]);
    }

    setCoursCollectifs(prev => [cours, ...prev]);
    return cours;
  }

  async function modifierStatutCours(coursId: string, statut: StatutCoursCollectif): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('cours_collectifs').update({ statut }).eq('id', coursId);
    if (error) {
      console.error('Erreur modification statut cours collectif:', error);
      toast.error('Erreur : ' + error.message);
      return false;
    }
    setCoursCollectifs(prev => prev.map(c => c.id === coursId ? { ...c, statut } : c));
    return true;
  }

  async function mettreAJourParticipation(
    participationId: string,
    patch: { statutPresence?: StatutPresenceCours; ressentiBorg?: number | null; ressentiBienetre?: number | null },
  ): Promise<boolean> {
    if (!supabase) return false;
    const dbPatch: Record<string, unknown> = {};
    if (patch.statutPresence !== undefined) dbPatch.statut_presence = patch.statutPresence;
    if (patch.ressentiBorg !== undefined) dbPatch.ressenti_borg = patch.ressentiBorg;
    if (patch.ressentiBienetre !== undefined) dbPatch.ressenti_bienetre = patch.ressentiBienetre;

    const { error } = await supabase.from('participations_cours_collectifs').update(dbPatch).eq('id', participationId);
    if (error) {
      console.error('Erreur mise à jour participation cours collectif:', error);
      toast.error('Erreur : ' + error.message);
      return false;
    }
    setParticipations(prev => prev.map(p => {
      if (p.id !== participationId) return p;
      return {
        ...p,
        ...(patch.statutPresence !== undefined ? { statutPresence: patch.statutPresence } : {}),
        ...(patch.ressentiBorg !== undefined ? { ressentiBorg: patch.ressentiBorg ?? undefined } : {}),
        ...(patch.ressentiBienetre !== undefined ? { ressentiBienetre: patch.ressentiBienetre ?? undefined } : {}),
      };
    }));
    return true;
  }

  function participationsDuCours(coursId: string): ParticipationCoursCollectif[] {
    return participations.filter(p => p.coursId === coursId);
  }

  return {
    coursCollectifs,
    participations,
    loading,
    creerCoursCollectif,
    modifierStatutCours,
    mettreAJourParticipation,
    participationsDuCours,
    recharger: charger,
  };
}
