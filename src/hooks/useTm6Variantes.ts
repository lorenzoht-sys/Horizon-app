import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Tm6Variante } from '../types';

function rowToVariante(r: Record<string, unknown>): Tm6Variante {
  return {
    id: r.id as string,
    nom: r.nom as string,
    distanceRef: (r.distance_ref as number | null) ?? null,
    typeMesure: (r.type_mesure as Tm6Variante['typeMesure']) ?? 'distance',
    intervalles: r.intervalles,
    createdAt: r.created_at as string | undefined,
  };
}

export function useTm6Variantes() {
  const [variantes, setVariantes] = useState<Tm6Variante[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('tm6_variantes').select('*').order('nom');
    if (data) setVariantes(data.map(rowToVariante));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  async function creer(
    nom: string,
    typeMesure: Tm6Variante['typeMesure'],
    distanceRef?: number | null,
  ): Promise<Tm6Variante | undefined> {
    if (!supabase) return;
    const { data } = await supabase.from('tm6_variantes').insert({
      nom,
      type_mesure: typeMesure,
      distance_ref: distanceRef ?? null,
    }).select().single();
    await fetch();
    return data ? rowToVariante(data) : undefined;
  }

  async function supprimer(id: string) {
    if (!supabase) return;
    await supabase.from('tm6_variantes').delete().eq('id', id);
    setVariantes(prev => prev.filter(v => v.id !== id));
  }

  return { variantes, loading, creer, supprimer };
}
