import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays } from 'date-fns';
import type { Contrat, Seance, JourSemaine, StatutContrat } from '../types';
import { calculerNombreSeances, genererDatesSeances, addMinutes } from '../utils/horaires';
import { DEMO_CONTRATS } from '../data/demoContrats';

const STORAGE_KEY = 'mouvtrack_contrats';

// Migration: anciens contrats stockaient jourFixe (string) au lieu de joursFixe (string[])
function migrateContrat(c: any): Contrat {
  if (!c.joursFixe && c.jourFixe) {
    return { ...c, joursFixe: [c.jourFixe] };
  }
  return c as Contrat;
}

function load(): Contrat[] {
  const cleared = !!localStorage.getItem('mouvtrack_demo_cleared');
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cleared ? [] : DEMO_CONTRATS;
    const stored: Contrat[] = JSON.parse(raw).map(migrateContrat);
    if (cleared) return stored;
    // Fusionner les contrats demo manquants
    const ids = new Set(stored.map(c => c.id));
    const missing = DEMO_CONTRATS.filter(c => !ids.has(c.id));
    return missing.length > 0 ? [...missing, ...stored] : stored;
  } catch {
    return cleared ? [] : DEMO_CONTRATS;
  }
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
  const [contrats, setContrats] = useState<Contrat[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contrats));
  }, [contrats]);

  function creerContrat(
    data: CreerContratData,
    adresse: string,
    coordonnees?: { lat: number; lng: number }
  ): { contrat: Contrat; seancesData: Omit<Seance, 'id'>[] } {
    const nbSeances = calculerNombreSeances(data.dateDebut, data.dateFin, data.joursFixe);
    const contrat: Contrat = {
      ...data,
      id: uuidv4(),
      statut: data.statut ?? 'actif',
      dateCreation: new Date().toISOString().split('T')[0],
      nombreSeancesTotal: nbSeances,
      nombreSeancesRealisees: 0,
    };
    setContrats(prev => [...prev, contrat]);

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

  function modifierStatut(id: string, statut: StatutContrat) {
    setContrats(prev => prev.map(c => c.id === id ? { ...c, statut } : c));
  }

  function supprimerContrat(id: string) {
    setContrats(prev => prev.filter(c => c.id !== id));
  }

  function incrementerSeancesRealisees(contratId: string) {
    setContrats(prev => prev.map(c =>
      c.id === contratId
        ? { ...c, nombreSeancesRealisees: Math.min(c.nombreSeancesRealisees + 1, c.nombreSeancesTotal) }
        : c
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
