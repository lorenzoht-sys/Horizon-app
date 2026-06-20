// Lecture/écriture des préférences de rappels (table rappel_preferences).
//
// - participantId omis  → réglages globaux du praticien (participant_id IS NULL).
// - participantId fourni → surcharge spécifique à ce patient (si elle existe),
//   sinon les réglages globaux du praticien sont affichés à titre indicatif
//   (`herite = true`) jusqu'à ce qu'une surcharge soit enregistrée.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface RappelPreferences {
  rappelSeanceActif: boolean;
  rappelSeanceDelaiHeures: number;
  rappelJourSeanceActif: boolean;
  rappelJourSeanceHeure: string; // "HH:MM" (colonne TIME, secondes tronquées pour l'UI)
}

export const RAPPEL_PREFS_DEFAUT: RappelPreferences = {
  rappelSeanceActif: true,
  rappelSeanceDelaiHeures: 2,
  rappelJourSeanceActif: true,
  rappelJourSeanceHeure: '08:00',
};

function rowToPrefs(row: Record<string, unknown>): RappelPreferences {
  return {
    rappelSeanceActif: Boolean(row.rappel_seance_actif),
    rappelSeanceDelaiHeures: Number(row.rappel_seance_delai_heures),
    rappelJourSeanceActif: Boolean(row.rappel_jour_seance_actif),
    rappelJourSeanceHeure: String(row.rappel_jour_seance_heure ?? '08:00:00').slice(0, 5),
  };
}

export function useRappelPreferences(participantId?: string) {
  const [prefs, setPrefs] = useState<RappelPreferences>(RAPPEL_PREFS_DEFAUT);
  // Pour un patient : true = pas de surcharge enregistrée, on affiche les
  // réglages globaux du praticien à titre indicatif.
  const [herite, setHerite] = useState(!!participantId);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);

    if (participantId) {
      const { data } = await supabase
        .from('rappel_preferences')
        .select('*')
        .eq('participant_id', participantId)
        .maybeSingle();

      if (data) {
        setPrefs(rowToPrefs(data));
        setHerite(false);
      } else {
        const { data: global } = await supabase
          .from('rappel_preferences')
          .select('*')
          .is('participant_id', null)
          .maybeSingle();
        setPrefs(global ? rowToPrefs(global) : RAPPEL_PREFS_DEFAUT);
        setHerite(true);
      }
    } else {
      const { data } = await supabase
        .from('rappel_preferences')
        .select('*')
        .is('participant_id', null)
        .maybeSingle();
      setPrefs(data ? rowToPrefs(data) : RAPPEL_PREFS_DEFAUT);
      setHerite(false);
    }

    setLoading(false);
  }, [participantId]);

  useEffect(() => { void charger(); }, [charger]);

  async function enregistrer(next: RappelPreferences): Promise<boolean> {
    if (!supabase) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const payload = {
      praticien_id: user.id,
      participant_id: participantId ?? null,
      rappel_seance_actif: next.rappelSeanceActif,
      rappel_seance_delai_heures: next.rappelSeanceDelaiHeures,
      rappel_jour_seance_actif: next.rappelJourSeanceActif,
      rappel_jour_seance_heure: next.rappelJourSeanceHeure,
    };

    // Pas d'upsert via onConflict : participant_id NULL (réglages globaux)
    // utilise un index unique partiel que PostgREST ne peut pas cibler.
    // On essaie d'abord une mise à jour, puis on insère si rien n'existe.
    let query = supabase.from('rappel_preferences').update(payload);
    query = participantId ? query.eq('participant_id', participantId) : query.is('participant_id', null);
    const { data: updated, error: updateError } = await query.select('id');
    if (updateError) return false;

    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase.from('rappel_preferences').insert(payload);
      if (insertError) return false;
    }

    setPrefs(next);
    setHerite(false);
    return true;
  }

  // Supprime la surcharge propre à ce patient → retombe sur les réglages globaux.
  async function reinitialiser(): Promise<boolean> {
    if (!supabase || !participantId) return false;
    const { error } = await supabase.from('rappel_preferences').delete().eq('participant_id', participantId);
    if (error) return false;
    await charger();
    return true;
  }

  return { prefs, herite, loading, enregistrer, reinitialiser, recharger: charger };
}
