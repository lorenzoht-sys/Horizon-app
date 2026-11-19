// Guide de démarrage : ce que le compte contient déjà, et l'état du guide
// (praticiens.demarrage). Comptages seulement (`head: true`) : aucune donnée de
// bénéficiaire ne quitte la base pour cet écran, hormis l'identifiant du
// dernier bénéficiaire actif, qui sert de cible aux boutons « bilan » et
// « programme ».
//
// Filtre explicite par praticien_id en plus de la RLS : un membre d'organisation
// peut LIRE des bénéficiaires partagés, qui ne doivent pas cocher SES étapes.
import { clientSupabase } from '../supabase';
import { SELECT_PROFIL } from '../facturesAValider';

const compter = (table: string, praticienId: string) =>
  clientSupabase().from(table).select('id', { count: 'exact', head: true }).eq('praticien_id', praticienId);

export const compterBeneficiaires = (praticienId: string) => compter('participants', praticienId);
export const compterBilans = (praticienId: string) => compter('bilans', praticienId);
export const compterProgrammes = (praticienId: string) => compter('programmes', praticienId);
export const compterCoursCollectifs = (praticienId: string) => compter('cours_collectifs', praticienId);

/** Séances posées par le praticien : celles de la programmation automatique des bilans ne comptent pas. */
export const compterSeances = (praticienId: string) =>
  compter('seances', praticienId).eq('bilan_auto', false);

export const lireDernierBeneficiaireActif = (praticienId: string) =>
  clientSupabase()
    .from('participants')
    .select('id')
    .eq('praticien_id', praticienId)
    .eq('archive', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

/** Profil de facturation, date de création du compte. Sans la colonne demarrage : voir ci-dessous. */
export const lireProfilDemarrage = (praticienId: string) =>
  clientSupabase()
    .from('praticiens')
    .select(`created_at, ${SELECT_PROFIL}`)
    .eq('id', praticienId)
    .maybeSingle();

// Lue et écrite à part des comptages : si la colonne manque (migration
// 20261119100000 pas encore appliquée), seule cette requête échoue, en 400, et le
// guide se replie sur la copie locale (src/hooks/useDemarrage.ts). Ce repli est un
// filet, pas un mode normal : la migration doit précéder le code.
export const lireEtatGuide = (praticienId: string) =>
  clientSupabase().from('praticiens').select('demarrage').eq('id', praticienId).maybeSingle();

export const ecrireEtatGuide = (praticienId: string, etat: object) =>
  clientSupabase().from('praticiens').update({ demarrage: etat }).eq('id', praticienId).select('id');
