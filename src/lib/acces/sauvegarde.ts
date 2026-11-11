// Export et restauration des données du praticien (Paramètres → Sauvegarde).
import { clientSupabase } from '../supabase';

export const exporterParticipantsComplets = () => clientSupabase()
  .from('participants')
  .select('*, bilans(*), programmes(*)')
  .order('created_at', { ascending: false });

export const restaurerParticipant = (ligne: object) => clientSupabase().from('participants').upsert(ligne);

export const restaurerBilan = (ligne: object) => clientSupabase().from('bilans').upsert(ligne);

export const restaurerProgramme = (ligne: object) => clientSupabase().from('programmes').upsert(ligne);
