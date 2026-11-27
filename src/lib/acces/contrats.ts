// Table `contrats` : payeur d'un contrat (bénéficiaire ou proche).
import { supabase } from '../supabase';
import { SELECT_PAYEUR } from '../payeurContrat';

export const lirePayeurContrat = (contratId: string) =>
  supabase.from('contrats').select(SELECT_PAYEUR).eq('id', contratId).maybeSingle();

export const majPayeurContrat = (contratId: string, miseAJour: object) =>
  supabase.from('contrats').update(miseAJour).eq('id', contratId).select(SELECT_PAYEUR);
