import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { lireLigneSuivi, type LigneSuivi } from '../lib/suiviSeances';

// Suivi de la facturation des séances du mois (PR 6) : suivi_facturation_seances() filtre déjà sur le
// praticien connecté (auth.uid()) ; les noms viennent de `participants` sous sa RLS.

export function useSuiviSeances(mois: string) {
  const [lignes, setLignes] = useState<LigneSuivi[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) { setChargement(false); return; }
      setChargement(true);
      const { data, error } = await supabase.rpc('suivi_facturation_seances', { p_mois: mois });
      if (annule) return;
      if (error) {
        console.error('[useSuiviSeances] lecture :', error);
        setErreur(error.message);
        setChargement(false);
        return;
      }
      const lues = ((data ?? []) as Record<string, unknown>[]).map(lireLigneSuivi);
      const ids = [...new Set(lues.map(l => l.participantId).filter((id): id is string => !!id))];
      const parId: Record<string, string> = {};
      if (ids.length) {
        const r = await supabase.from('participants').select('id, nom, prenom').in('id', ids);
        if (annule) return;
        for (const p of (r.data ?? []) as { id: string; nom: string | null; prenom: string | null }[]) {
          parId[p.id] = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || 'Bénéficiaire';
        }
      }
      setErreur(null);
      setLignes(lues);
      setNoms(parId);
      setChargement(false);
    })();
    return () => { annule = true; };
  }, [mois]);

  return { lignes, noms, chargement, erreur };
}
