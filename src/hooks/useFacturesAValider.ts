import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  SELECT_BROUILLON,
  SELECT_FACTURE_VALIDEE,
  SELECT_PROFIL,
  lireBrouillon,
  lireFactureValidee,
  lireProfil,
  messageValidationLisible,
  validerEnSerie,
  type BilanValidation,
  type FactureBrouillon,
  type FactureValidee,
  type ProfilFacturation,
} from '../lib/facturesAValider';

// Écran « Factures à valider » : lecture et validation directement sous la RLS du praticien
// connecté. Aucune route /api : le plan Vercel plafonne le nombre de fonctions, et valider_facture
// (migration 20261006100200) est déjà un appel RPC qui contrôle l'appelant lui-même
// (propriétaire de la facture, ou service_role).
//
// Un praticien ne lit que ses factures (policy factures_praticien) : la requête ci-dessous n'a
// donc AUCUN filtre sur le praticien, et ne doit jamais en avoir besoin pour être sûre. Les
// brouillons d'un autre praticien ne sont ni visibles ni validables (tests/db/facturation-cron.spec.ts).

export function useFacturesAValider() {
  const [brouillons, setBrouillons] = useState<FactureBrouillon[]>([]);
  const [profil, setProfil] = useState<ProfilFacturation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());

  const charger = useCallback(async () => {
    if (!supabase) { setChargement(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const [fb, pr] = await Promise.all([
      supabase
        .from('factures')
        .select(SELECT_BROUILLON)
        .eq('statut', 'brouillon')
        .eq('type', 'facture')
        .order('periode', { ascending: false }),
      user
        ? supabase.from('praticiens').select(SELECT_PROFIL).eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (fb.error) {
      console.error('[useFacturesAValider] lecture des brouillons :', fb.error);
      setErreur(fb.error.message);
    } else {
      setErreur(null);
      const lus = ((fb.data ?? []) as unknown as Record<string, unknown>[]).map(lireBrouillon);
      // Par mois (le plus récent d'abord), puis par nom de bénéficiaire.
      lus.sort((a, b) => b.periode.localeCompare(a.periode) ||
        `${a.beneficiaire.nom} ${a.beneficiaire.prenom}`.localeCompare(`${b.beneficiaire.nom} ${b.beneficiaire.prenom}`, 'fr'));
      setBrouillons(lus);
    }
    setProfil(lireProfil((pr.data as Record<string, unknown> | null) ?? null));
    setChargement(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  /** Valide UNE facture : numéro attribué, facture verrouillée. Ne lève jamais. */
  const validerUne = useCallback(async (id: string): Promise<{ numero: string } | { erreur: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    setEnCours(prev => new Set(prev).add(id));
    try {
      const { data, error } = await supabase.rpc('valider_facture', { p_facture_id: id });
      if (error) return { erreur: messageValidationLisible(error.message) };
      return { numero: String(data) };
    } finally {
      setEnCours(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, []);

  /** Valide plusieurs factures l'une après l'autre, puis recharge la liste. */
  const validerPlusieurs = useCallback(async (ids: string[]): Promise<BilanValidation> => {
    const bilan = await validerEnSerie(ids, validerUne);
    await charger();
    return bilan;
  }, [validerUne, charger]);

  return { brouillons, profil, chargement, erreur, enCours, validerPlusieurs, rafraichir: charger };
}

/** Factures déjà validées (numérotées, verrouillées) : liste minimale, sans PDF à cette étape. */
export function useFacturesValidees() {
  const [factures, setFactures] = useState<FactureValidee[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) { setChargement(false); return; }
      const { data, error } = await supabase
        .from('factures')
        .select(SELECT_FACTURE_VALIDEE)
        .neq('statut', 'brouillon')
        .order('date_emission', { ascending: false })
        .order('numero', { ascending: false })
        .limit(300);
      if (annule) return;
      if (error) {
        console.error('[useFacturesValidees] lecture :', error);
        setErreur(error.message);
      } else {
        setFactures(((data ?? []) as unknown as Record<string, unknown>[]).map(lireFactureValidee));
      }
      setChargement(false);
    })();
    return () => { annule = true; };
  }, []);

  return { factures, chargement, erreur };
}
