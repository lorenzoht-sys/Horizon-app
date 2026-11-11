// Table `structures` : lecture directe d'une structure partenaire.
import { clientSupabase } from '../supabase';

export const lireStructure = (id: string) => clientSupabase().from('structures').select('*').eq('id', id).single();
