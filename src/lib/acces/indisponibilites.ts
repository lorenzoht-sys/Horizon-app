// Table `indisponibilites` : créneaux où le praticien n'est pas disponible.
import { clientSupabase } from '../supabase';

export const listerIndisponibilites = () => clientSupabase().from('indisponibilites').select('*').order('jour');

export const ajouterIndisponibilite = (ligne: object) => clientSupabase().from('indisponibilites').insert(ligne);

export const supprimerIndisponibilite = (id: string) => clientSupabase().from('indisponibilites').delete().eq('id', id);
