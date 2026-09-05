import { useState, useEffect, useCallback } from 'react';
import type { Indisponibilite } from '../types';
import { supabase } from '../lib/supabase';

export function useIndispos() {
  const [indispos, setIndispos] = useState<Indisponibilite[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('indisponibilites')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement indisponibilités:', error); return; }
        setIndispos((data ?? []).map(row => ({
          id: row.id,
          jour: row.jour as Indisponibilite['jour'],
          heureDebut: row.heure_debut,
          heureFin: row.heure_fin,
          recurrente: row.recurrente ?? true,
          label: row.label ?? undefined,
        })));
      });
    return () => { cancelled = true; };
  }, []);

  const indisposDuJour = useCallback(
    (jour: Indisponibilite['jour']): Indisponibilite[] =>
      indispos
        .filter(i => i.jour === jour)
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut)),
    [indispos],
  );

  return { indispos, indisposDuJour };
}
