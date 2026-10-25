import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { BilansAuto } from '../types';
import { supabase } from '../lib/supabase';
import { dbToBilansAuto } from '../lib/mappers';

// Réglage « bilans automatiques » d'UN bénéficiaire (table bilans_auto). Pas de ligne = désactivé.
// La pose des séances elle-même est faite par l'appelant (voir SectionBilansAuto), avec les fonctions
// pures de lib/bilansAuto.ts.
export function useBilansAuto(participantId: string | undefined) {
  const [reglage, setReglage] = useState<BilansAuto | null>(null);
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    setReglage(null);
    setCharge(false);
    if (!supabase || !participantId) { setCharge(true); return; }
    let cancelled = false;
    supabase
      .from('bilans_auto')
      .select('*')
      .eq('participant_id', participantId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Erreur chargement bilans automatiques:', error);
        setReglage(data ? dbToBilansAuto(data) : null);
        setCharge(true);
      });
    return () => { cancelled = true; };
  }, [participantId]);

  async function enregistrer(actif: boolean, frequenceMois: number): Promise<boolean> {
    if (!participantId) return false;
    if (supabase) {
      const { error } = await supabase.from('bilans_auto')
        .upsert({ participant_id: participantId, actif, frequence_mois: frequenceMois }, { onConflict: 'participant_id' });
      if (error) {
        console.error('Erreur enregistrement bilans automatiques:', error);
        toast.error('Impossible d’enregistrer le réglage des bilans automatiques.');
        return false;
      }
    }
    setReglage({ participantId, actif, frequenceMois });
    return true;
  }

  return { reglage, charge, enregistrer };
}
