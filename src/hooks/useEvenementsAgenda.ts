import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { EvenementAgenda } from '../types';
import { supabase } from '../lib/supabase';
import { dbToEvenementAgenda, evenementAgendaToDb } from '../lib/mappers';

export function useEvenementsAgenda() {
  const [evenements, setEvenements] = useState<EvenementAgenda[]>([]);

  useEffect(() => {
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
    const { error } = await supabase.from('evenements_agenda').insert(evenementAgendaToDb(nouveau));
    if (error) {
      console.error('Erreur création événement agenda:', error);
      toast.error("Impossible de créer l'événement.");
      throw new Error(error.message);
    }
    setEvenements(prev => [...prev, nouveau]);
    return nouveau;
  }

  // Mise à jour de la ligne existante (même id) : l'UID iCal « evenement-<id> » ne change pas,
  // Google Agenda met donc à jour l'événement au lieu d'en créer un second.
  async function modifierEvenement(id: string, data: Omit<EvenementAgenda, 'id'>): Promise<boolean> {
    const { error } = await supabase.from('evenements_agenda').update(evenementAgendaToDb(data)).eq('id', id);
    if (error) {
      console.error('Erreur modification événement agenda:', error);
      toast.error("Impossible de modifier l'événement.");
      return false;
    }
    setEvenements(prev => prev.map(e => (e.id === id ? { ...data, id } : e)));
    return true;
  }

  async function supprimerEvenement(id: string) {
    const { error } = await supabase.from('evenements_agenda').delete().eq('id', id);
    if (error) {
      console.error('Erreur suppression événement agenda:', error);
      toast.error("Impossible de supprimer l'événement.");
      return;
    }
    setEvenements(prev => prev.filter(e => e.id !== id));
  }

  return { evenements, creerEvenement, modifierEvenement, supprimerEvenement };
}
