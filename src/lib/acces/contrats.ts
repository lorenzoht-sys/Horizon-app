// Table `contrats` : payeur d'un contrat (bénéficiaire ou proche).
import { clientSupabase } from '../supabase';
import { SELECT_PAYEUR } from '../payeurContrat';

export const lirePayeurContrat = (contratId: string) =>
  clientSupabase().from('contrats').select(SELECT_PAYEUR).eq('id', contratId).maybeSingle();

export const majPayeurContrat = (contratId: string, miseAJour: object) =>
  clientSupabase().from('contrats').update(miseAJour).eq('id', contratId).select(SELECT_PAYEUR);
