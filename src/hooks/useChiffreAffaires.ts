import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ajouterMois,
  caParMoisCle,
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

export interface Beneficiaire { id: string; nom: string }

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
    const { data: { user } } = await supabase.auth.getUser();
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
 * CA total par mois (« AAAA-MM » → montant HT) de l'année civile en cours, plus le mois précédent si on
 * est en janvier : alimente les cartes et le graphique de « Mes stats ». Remplace l'ancienne saisie
 * locale (localStorage), supprimée le 2026-10-09.
 */
export function useCaAnneeEnCours(): Record<string, number> {
  const [caParMois, setCaParMois] = useState<Record<string, number>>({});
  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) return;
      const maintenant = new Date();
      const janvier = `${maintenant.getFullYear()}-01-01`;
      const { data, error } = await supabase.rpc('chiffre_affaires_mensuel', { p_debut: ajouterMois(janvier, -1), p_fin: `${maintenant.getFullYear()}-12-01` });
      if (annule) return;
      if (error) { console.error('[useCaAnneeEnCours] lecture :', error); return; }
      setCaParMois(caParMoisCle(((data ?? []) as Record<string, unknown>[]).map(lireLigneCA)));
    })();
    return () => { annule = true; };
  }, []);
  return caParMois;
}
