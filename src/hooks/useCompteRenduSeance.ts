import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CompteRenduSeance, CompteRenduSeanceInsert } from '../types/seance';
import { supabase } from '../lib/supabase';
import { dbToCompteRendu, compteRenduToDb } from '../lib/mappers';

const lsKey = (id: string) => `comptes_rendus_${id}`;

function loadFromLS(participantId: string): CompteRenduSeance[] {
  try { return JSON.parse(localStorage.getItem(lsKey(participantId)) ?? '[]'); }
  catch { return []; }
}

function saveToLS(participantId: string, data: CompteRenduSeance[]) {
  try { localStorage.setItem(lsKey(participantId), JSON.stringify(data)); } catch {}
}

export function useCompteRenduSeance(participantId: string) {
  const [compteRendus, setCompteRendus] = useState<CompteRenduSeance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!participantId) return;

    if (supabase) {
      setLoading(true);
      supabase
        .from('comptes_rendus_seances')
        .select('*')
        .eq('participant_id', participantId)
        .order('date_seance', { ascending: false })
        .then(({ data, error }) => {
          setLoading(false);
          if (error) {
            console.error('Erreur chargement comptes rendus:', error);
            setCompteRendus(loadFromLS(participantId));
            return;
          }
          setCompteRendus((data ?? []).map(dbToCompteRendu));
        });
    } else {
      setCompteRendus(loadFromLS(participantId));
    }
  }, [participantId]);

  const ajouterCompteRendu = useCallback(async (data: CompteRenduSeanceInsert): Promise<CompteRenduSeance> => {
    const nouveau: CompteRenduSeance = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (supabase) {
      const { error } = await supabase
        .from('comptes_rendus_seances')
        .insert(compteRenduToDb(nouveau));
      if (error) console.error('Erreur sauvegarde compte rendu:', error);
    }

    setCompteRendus(prev => {
      const newList = [nouveau, ...prev];
      saveToLS(participantId, newList);
      return newList;
    });

    return nouveau;
  }, [participantId]);

  return { compteRendus, loading, ajouterCompteRendu };
}
