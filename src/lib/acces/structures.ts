// Table `structures` : lecture directe d'une structure partenaire.
import { supabase } from '../supabase';

export const lireStructure = (id: string) => supabase.from('structures').select('*').eq('id', id).single();
