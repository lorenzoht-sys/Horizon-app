import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays } from 'date-fns';
import type { Contrat, Seance, JourSemaine, StatutContrat } from '../types';
import { calculerNombreSeances, genererDatesSeances, addMinutes } from '../utils/horaires';
import { supabase } from '../lib/supabase';
import { dbToContrat, contratToDb } from '../lib/mappers';
import { DEMO_CONTRATS } from '../data/demoContrats';

const LS_KEY = 'mouvtrack_contrats';

function loadFromLocal(): Contrat[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : DEMO_CONTRATS;
  } catch {
    return DEMO_CONTRATS;
  }
}

function saveToLocal(contrats: Contrat[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(contrats));
}

interface CreerContratData {
  participantId: string;
  dateDebut: string;
  dateFin: string;
  joursFixe: JourSemaine[];
  heureDebut: string;
  dureeMinutes: number;
  statut?: StatutContrat;
  notes?: string;
}

export function useContrats() {
  const [contrats, setContrats] = useState<Contrat[]>([]);

  useEffect(() => {
    if (!supabase) {
      setContrats(loadFromLocal());
      return;
    }
    let cancelled = false;
    supabase
      .from('contrats')
      .select('*')
      .order('date_creation', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement contrats:', error); return; }
        setContrats((data ?? []).map(dbToContrat));
      });
    return () => { cancelled = true; };
  }, []);

  async function creerContrat(
    data: CreerContratData,
    adresse: string,
    coordonnees?: { lat: number; lng: number }
  ): Promise<{ contrat: Contrat; seancesData: Omit<Seance, 'id'>[] }> {
    const nbSeances = calculerNombreSeances(data.dateDebut, data.dateFin, data.joursFixe);
    const contrat: Contrat = {
      ...data,
      id: uuidv4(),
      statut: data.statut ?? 'actif',
      dateCreation: new Date().toISOString().split('T')[0],
      nombreSeancesTotal: nbSeances,
      nombreSeancesRealisees: 0,
    };

    if (!supabase) {
      setContrats(prev => {
        const updated = [...prev, contrat];
        saveToLocal(updated);
        return updated;
      });
    } else {
      const { error } = await supabase.from('contrats').insert(contratToDb(contrat));
      if (error) { console.error('Erreur création contrat:', error); }
      else { setContrats(prev => [...prev, contrat]); }
    }

    const dates = genererDatesSeances(data.dateDebut, data.dateFin, data.joursFixe);
    const heureFin = addMinutes(data.heureDebut, data.dureeMinutes);
    const seancesData: Omit<Seance, 'id'>[] = dates.map(date => ({
      participantId: data.participantId,
      contratId: contrat.id,
      date,
      heureDebut: data.heureDebut,
      heureFin,
      dureeMinutes: data.dureeMinutes,
      type: 'seance' as const,
      statut: 'planifiee' as const,
      adresse,
      coordonnees,
    }));

    return { contrat, seancesData };
  }

  async function modifierStatut(id: string, statut: StatutContrat) {
    if (!supabase) {
      setContrats(prev => {
        const updated = prev.map(c => c.id === id ? { ...c, statut } : c);
        saveToLocal(updated);
        return updated;
      });
      return;
    }
    await supabase.from('contrats').update({ statut }).eq('id', id);
    setContrats(prev => prev.map(c => c.id === id ? { ...c, statut } : c));
  }

  async function supprimerContrat(id: string) {
    if (!supabase) {
      setContrats(prev => {
        const updated = prev.filter(c => c.id !== id);
        saveToLocal(updated);
        return updated;
      });
      return;
    }
    await supabase.from('contrats').delete().eq('id', id);
    setContrats(prev => prev.filter(c => c.id !== id));
  }

  async function incrementerSeancesRealisees(contratId: string) {
    const contrat = contrats.find(c => c.id === contratId);
    if (!contrat) return;
    const newCount = Math.min(contrat.nombreSeancesRealisees + 1, contrat.nombreSeancesTotal);
    if (!supabase) {
      setContrats(prev => {
        const updated = prev.map(c =>
          c.id === contratId ? { ...c, nombreSeancesRealisees: newCount } : c
        );
        saveToLocal(updated);
        return updated;
      });
      return;
    }
    await supabase.from('contrats').update({ nombre_seances_realisees: newCount }).eq('id', contratId);
    setContrats(prev => prev.map(c =>
      c.id === contratId ? { ...c, nombreSeancesRealisees: newCount } : c
    ));
  }

  function contratsDeParticipant(participantId: string): Contrat[] {
    return contrats
      .filter(c => c.participantId === participantId)
      .sort((a, b) => new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime());
  }

  function contratActifDeParticipant(participantId: string): Contrat | undefined {
    return contrats.find(c => c.participantId === participantId && c.statut === 'actif');
  }

  const contratsARenouveler = contrats.filter(c => {
    if (c.statut !== 'actif') return false;
    const joursRestants = differenceInDays(new Date(c.dateFin), new Date());
    return joursRestants <= 14 && joursRestants >= 0;
  });

  return {
    contrats,
    creerContrat,
    modifierStatut,
    supprimerContrat,
    incrementerSeancesRealisees,
    contratsDeParticipant,
    contratActifDeParticipant,
    contratsARenouveler,
  };
}
