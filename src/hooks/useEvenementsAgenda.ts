import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { EvenementAgenda } from '../types';
import { supabase } from '../lib/supabase';
import { dbToEvenementAgenda, evenementAgendaToDb } from '../lib/mappers';

export function useEvenementsAgenda() {
  const [evenements, setEvenements] = useState<EvenementAgenda[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('evenements_agenda')
      .select('*')
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement événements agenda:', error); return; }
        setEvenements((data ?? []).map(dbToEvenementAgenda));
      });
    return () => { cancelled = true; };
  }, []);

  async function creerEvenement(data: Omit<EvenementAgenda, 'id'>): Promise<EvenementAgenda> {
    const nouveau: EvenementAgenda = { ...data, id: uuidv4() };
    if (supabase) {
      const { error } = await supabase.from('evenements_agenda').insert(evenementAgendaToDb(nouveau));
      if (error) {
        console.error('Erreur création événement agenda:', error);
        toast.error("Impossible de créer l'événement.");
        throw new Error(error.message);
      }
    }
    setEvenements(prev => [...prev, nouveau]);
    return nouveau;
  }

  async function supprimerEvenement(id: string) {
    if (supabase) {
      const { error } = await supabase.from('evenements_agenda').delete().eq('id', id);
      if (error) {
        console.error('Erreur suppression événement agenda:', error);
        toast.error("Impossible de supprimer l'événement.");
        return;
      }
    }
    setEvenements(prev => prev.filter(e => e.id !== id));
  }

  return { evenements, creerEvenement, supprimerEvenement };
}
