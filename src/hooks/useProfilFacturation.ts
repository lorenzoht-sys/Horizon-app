import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  SELECT_PROFIL_FACTURATION,
  formulaireVersMiseAJour,
  lireFormulaire,
  lireIdentite,
  messageEnregistrementLisible,
  validerFormulaire,
  type ErreursFormulaire,
  type FormulaireFacturation,
  type IdentiteProfil,
} from '../lib/profilFacturation';

// Profil de facturation du praticien connecté : lecture et écriture DIRECTES sous la RLS de
// `praticiens` (policies praticiens_select / praticiens_update : id = auth.uid()), sans route /api
// (plafond de fonctions Vercel). La requête n'a aucun filtre de sécurité à porter : `.eq('id', …)`
// ne sert qu'à cibler la ligne, la RLS refuserait de toute façon la ligne d'un autre.
//
// On n'écrit QUE les colonnes de facturation (formulaireVersMiseAJour), jamais un `select *`
// renvoyé tel quel : l'identité reste la propriété de la page Paramètres.

export type ResultatEnregistrement =
  | { ok: true }
  | { ok: false; message: string; erreurs?: ErreursFormulaire };

export function useProfilFacturation() {
  const [identite, setIdentite] = useState<IdentiteProfil | null>(null);
  const [initial, setInitial] = useState<FormulaireFacturation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!supabase) { setChargement(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErreur('Utilisateur non connecté'); setChargement(false); return; }
    const { data, error } = await supabase
      .from('praticiens')
      .select(SELECT_PROFIL_FACTURATION)
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('[useProfilFacturation] lecture :', error);
      setErreur(error.message);
    } else if (!data) {
      setErreur('Profil introuvable : ouvrez d\'abord Paramètres pour créer votre profil.');
    } else {
      const row = data as unknown as Record<string, unknown>;
      setErreur(null);
      setIdentite(lireIdentite(row));
      setInitial(lireFormulaire(row));
    }
    setChargement(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  /** Contrôle la forme, écrit, puis RELIT la ligne : ce qui s'affiche est ce qui est en base. */
  const enregistrer = useCallback(async (formulaire: FormulaireFacturation): Promise<ResultatEnregistrement> => {
    if (!supabase) return { ok: false, message: 'Base de données indisponible' };
    const erreurs = validerFormulaire(formulaire);
    if (Object.keys(erreurs).length > 0) return { ok: false, message: 'Veuillez corriger les erreurs', erreurs };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Utilisateur non connecté' };

    const { data, error } = await supabase
      .from('praticiens')
      .update(formulaireVersMiseAJour(formulaire))
      .eq('id', user.id)
      .select(SELECT_PROFIL_FACTURATION);
    if (error) return { ok: false, message: messageEnregistrementLisible(error.message) };
    // 0 ligne = RLS ou profil absent : sans ce contrôle, un « succès » silencieux sans rien écrit.
    if (!data || data.length !== 1) return { ok: false, message: 'Profil introuvable : rien n\'a été enregistré.' };

    const row = data[0] as unknown as Record<string, unknown>;
    setIdentite(lireIdentite(row));
    setInitial(lireFormulaire(row));
    return { ok: true };
  }, []);

  return { identite, initial, chargement, erreur, enregistrer };
}
