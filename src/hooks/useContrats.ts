import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import type { Contrat, StatutContrat, PeriodiciteContrat } from '../types';
import { calculerNbSeancesEstime, CYCLE_SEMAINES } from '../utils/horaires';
import { supabase } from '../lib/supabase';
import { dbToContrat, contratToDb } from '../lib/mappers';

interface CreerContratData {
  participantId: string;
  dateDebut: string;
  dateFin: string;
  /** Nombre de séances par occurrence du cycle (1 pour deux_semaines/trois_semaines). */
  nbSeancesSemaine: number;
  /** Défaut 'semaine' si absent. */
  periodicite?: PeriodiciteContrat;
  heureDebut: string;
  /** Durée de chaque séance de la semaine, dans l'ordre chronologique (séance 1, séance 2...). */
  dureesSeances: number[];
  statut?: StatutContrat;
  notes?: string;
  dureeIndeterminee?: boolean;
  /** Si true, ce contrat est ignoré par le planificateur de tournée (Mode A et B). */
  exclureTournee?: boolean;
}

export function useContrats() {
  const [contrats, setContrats] = useState<Contrat[]>([]);

  useEffect(() => {
    if (!supabase) return;
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

  async function creerContrat(data: CreerContratData): Promise<Contrat> {
    const periodicite = data.periodicite ?? 'semaine';
    // calculerNbSeancesEstime attend un taux hebdomadaire : pour un cycle de
    // 2/3 semaines, nbSeancesSemaine (séances par occurrence, toujours 1) est
    // dilué par la taille du cycle (1 séance toutes les 2 semaines = taux 0.5).
    const tauxHebdo = data.nbSeancesSemaine / CYCLE_SEMAINES[periodicite];
    const nbSeances = calculerNbSeancesEstime(data.dateDebut, data.dateFin, tauxHebdo);
    let praticienId: string | undefined;
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      praticienId = user?.id;
    }

    const contrat: Contrat = {
      id: uuidv4(),
      participantId: data.participantId,
      praticienId,
      dateDebut: data.dateDebut,
      dateFin: data.dateFin,
      nbSeancesSemaine: data.nbSeancesSemaine,
      periodicite,
      heureDebut: data.heureDebut,
      dureeMinutes: data.dureesSeances[0] ?? 45,
      dureesSeances: data.dureesSeances,
      statut: data.statut ?? 'actif',
      notes: data.notes,
      dureeIndeterminee: data.dureeIndeterminee,
      dateCreation: new Date().toISOString().split('T')[0],
      nombreSeancesTotal: nbSeances,
      nombreSeancesRealisees: 0,
      exclureTournee: data.exclureTournee ?? false,
    };

    if (supabase) {
      const { error } = await supabase.from('contrats').insert(contratToDb(contrat));
      if (error) {
        console.error('Erreur création contrat:', error);
        throw new Error(error.message);
      }
    }
    setContrats(prev => [...prev, contrat]);
    return contrat;
  }

  async function modifierStatut(id: string, statut: StatutContrat) {
    if (supabase) {
      const { error } = await supabase.from('contrats').update({ statut }).eq('id', id);
      if (error) { console.error('Erreur modification statut contrat:', error); toast.error('Erreur : ' + error.message); return; }
    }
    setContrats(prev => prev.map(c => c.id === id ? { ...c, statut } : c));
  }

  async function toggleExclureTournee(id: string, exclureTournee: boolean) {
    if (supabase) {
      const { error } = await supabase.from('contrats').update({ exclure_tournee: exclureTournee }).eq('id', id);
      if (error) { console.error('Erreur modification exclure_tournee:', error); toast.error('Erreur : ' + error.message); return; }
    }
    setContrats(prev => prev.map(c => c.id === id ? { ...c, exclureTournee } : c));
  }

  async function supprimerContrat(id: string) {
    if (supabase) {
      const { error } = await supabase.from('contrats').delete().eq('id', id);
      if (error) { console.error('Erreur suppression contrat:', error); toast.error('Erreur : ' + error.message); return; }
    }
    setContrats(prev => prev.filter(c => c.id !== id));
  }

  async function incrementerSeancesRealisees(contratId: string) {
    const contrat = contrats.find(c => c.id === contratId);
    if (!contrat) return;
    const newCount = Math.min(contrat.nombreSeancesRealisees + 1, contrat.nombreSeancesTotal);
    if (supabase) {
      const { error } = await supabase.from('contrats').update({ nombre_seances_realisees: newCount }).eq('id', contratId);
      if (error) { console.error('Erreur incrémentation séances:', error); toast.error('Erreur : ' + error.message); return; }
    }
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
    toggleExclureTournee,
    supprimerContrat,
    incrementerSeancesRealisees,
    contratsDeParticipant,
    contratActifDeParticipant,
    contratsARenouveler,
  };
}
