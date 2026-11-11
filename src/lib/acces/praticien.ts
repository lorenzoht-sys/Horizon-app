// Table `praticiens` : profil du praticien connecté.
import { clientSupabase } from '../supabase';

// La table n'est pas typée côté client : même `any` que dans les pages d'origine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (clientSupabase() as any).from('praticiens');

export const lirePraticien = (id: string, colonnes: string) => table().select(colonnes).eq('id', id).single();

/** Crée ou met à jour le profil et renvoie la ligne complète. */
export const enregistrerPraticien = (ligne: object) => table().upsert(ligne).select().single();

export const creerPraticien = (ligne: object) => table().insert(ligne);

export const majTokenPlanning = (id: string, token: string) =>
  clientSupabase().from('praticiens').update({ token_planning_ics: token }).eq('id', id);
