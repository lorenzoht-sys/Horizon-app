// Export et restauration des données du praticien (Paramètres → Sauvegarde).
import { supabase } from '../supabase';

export const exporterParticipantsComplets = () => supabase
  .from('participants')
  .select('*, bilans(*), programmes(*)')
  .order('created_at', { ascending: false });

export const restaurerParticipant = (ligne: object) => supabase.from('participants').upsert(ligne);

export const restaurerBilan = (ligne: object) => supabase.from('bilans').upsert(ligne);

export const restaurerProgramme = (ligne: object) => supabase.from('programmes').upsert(ligne);
