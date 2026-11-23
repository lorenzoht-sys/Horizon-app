import { useState } from 'react';
import { seances as initiales } from '../donnees';
export function useAgenda() {
  const [seances, set] = useState(initiales as never[] as { id: string; date: string; heureDebut: string; statut: string }[]);
  return {
    seances, seancesChargees: true,
    seancesDuJour: (d: string) => seances.filter(s => s.date === d && s.statut !== 'annulee').sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)),
    modifierSeance: async (id: string, patch: object) => { await new Promise(r => setTimeout(r, 300)); set(l => l.map(s => s.id === id ? { ...s, ...patch } : s)); return true; },
    patientsARelancer: () => [{ id: 'e5', prenom: 'Bernard', nom: 'Collin' }],
  } as never;
}
