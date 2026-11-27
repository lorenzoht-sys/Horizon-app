import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { utilisateurCourant } from '../lib/session';
import {
  lireLigneCA,
  lireSaisie,
  plageHistorique,
  type LigneCA,
  type SaisieExterne,
} from '../lib/chiffreAffaires';

// Suivi du chiffre d'affaires (page /factures/ca) : lecture par supabase.rpc('chiffre_affaires_mensuel')
// et accès direct à ca_externe, tous deux sous la RLS du praticien connecté. Aucune route /api : le plan
// Vercel plafonne le nombre de fonctions. La règle « quelles factures comptent » est dans la fonction SQL.
// Les saisies externes ne sont PAS des pièces comptables : on les modifie et on les supprime librement.

interface Beneficiaire { id: string; nom: string }

export function useChiffreAffaires(mois: string) {
  const [lignes, setLignes] = useState<LigneCA[]>([]);
  const [saisies, setSaisies] = useState<SaisieExterne[]>([]);
  const [beneficiaires, setBeneficiaires] = useState<Beneficiaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) { setChargement(false); return; }
      setChargement(true);
      const { debut, fin } = plageHistorique(mois, 12);
      const [ca, ext, ben] = await Promise.all([
        supabase.rpc('chiffre_affaires_mensuel', { p_debut: debut, p_fin: fin }),
        supabase.from('ca_externe').select('id, participant_id, mois, libelle, montant').eq('mois', mois).order('created_at'),
        supabase.from('participants').select('id, nom, prenom').order('nom'),
      ]);
      if (annule) return;
      const echec = ca.error ?? ext.error ?? ben.error;
      if (echec) {
        console.error('[useChiffreAffaires] lecture :', echec);
        setErreur(echec.message);
      } else {
        setErreur(null);
        setLignes(((ca.data ?? []) as Record<string, unknown>[]).map(lireLigneCA));
        setSaisies(((ext.data ?? []) as Record<string, unknown>[]).map(lireSaisie));
        setBeneficiaires(((ben.data ?? []) as { id: string; nom: string | null; prenom: string | null }[])
          .map(p => ({ id: p.id, nom: `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || 'Bénéficiaire' })));
      }
      setChargement(false);
    })();
    return () => { annule = true; };
  }, [mois, version]);

  const noms = useMemo(() => Object.fromEntries(beneficiaires.map(b => [b.id, b.nom])), [beneficiaires]);
  const recharger = useCallback(() => setVersion(v => v + 1), []);

  /** Ajoute une saisie au mois affiché. Ne lève jamais. */
  const ajouter = useCallback(async (v: { participantId: string; libelle: string; montant: number }): Promise<{ erreur?: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const user = await utilisateurCourant();
    if (!user) return { erreur: 'Session expirée' };
    const { error } = await supabase.from('ca_externe').insert({
      praticien_id: user.id, participant_id: v.participantId, mois, libelle: v.libelle, montant: v.montant,
    });
    if (error) return { erreur: error.message };
    recharger();
    return {};
  }, [mois, recharger]);

  const modifier = useCallback(async (id: string, v: { participantId: string; libelle: string; montant: number }): Promise<{ erreur?: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const { error } = await supabase.from('ca_externe').update({ participant_id: v.participantId, libelle: v.libelle, montant: v.montant }).eq('id', id);
    if (error) return { erreur: error.message };
    recharger();
    return {};
  }, [recharger]);

  const supprimer = useCallback(async (id: string): Promise<{ erreur?: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const { error } = await supabase.from('ca_externe').delete().eq('id', id);
    if (error) return { erreur: error.message };
    recharger();
    return {};
  }, [recharger]);

  return { lignes, saisies, beneficiaires, noms, chargement, erreur, ajouter, modifier, supprimer };
}

/**
 * Lignes de CA (mois × bénéficiaire, HT) des 12 derniers mois, mois en cours compris : alimente « Mes
 * stats » (évolution, origine du CA, détail par structure). Remplace le 2026-11-24 useCaAnneeEnCours,
 * qui ne couvrait que l'année civile et ne gardait que les totaux par mois. Même fonction SQL, même
 * règle : factures émises au mois de la prestation + CA externe ; le mois en cours, lui, vit surtout
 * dans les brouillons (lus à part, voir useFacturesAValider).
 */
export function useCaDouzeMois(): { lignes: LigneCA[]; chargement: boolean } {
  const [lignes, setLignes] = useState<LigneCA[]>([]);
  const [chargement, setChargement] = useState(true);
  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) { setChargement(false); return; }
      const maintenant = new Date();
      const mois = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-01`;
      const { debut, fin } = plageHistorique(mois, 12);
      const { data, error } = await supabase.rpc('chiffre_affaires_mensuel', { p_debut: debut, p_fin: fin });
      if (annule) return;
      if (error) console.error('[useCaDouzeMois] lecture :', error);
      else setLignes(((data ?? []) as Record<string, unknown>[]).map(lireLigneCA));
      setChargement(false);
    })();
    return () => { annule = true; };
  }, []);
  return { lignes, chargement };
}
