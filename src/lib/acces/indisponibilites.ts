// Table `indisponibilites` : créneaux où le praticien n'est pas disponible.
import { supabase } from '../supabase';

export const listerIndisponibilites = () => supabase.from('indisponibilites').select('*').order('jour');

export const ajouterIndisponibilite = (ligne: object) => supabase.from('indisponibilites').insert(ligne);

export const supprimerIndisponibilite = (id: string) => supabase.from('indisponibilites').delete().eq('id', id);
