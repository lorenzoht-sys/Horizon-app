import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { TarifContrat } from '../types';
import { supabase } from '../lib/supabase';
import { dbToTarifContrat, tarifContratToDb } from '../lib/mappers';
import { dateCivileParis, jourPrecedent, messageErreurTarif, planChangementTarif } from '../lib/tarifsContrats';

/**
 * Charge les versions de tarif d'un contrat, triées de la plus récente à la
 * plus ancienne. Fonction autonome (pas seulement interne au hook) : c'est
 * aussi ce que StatsPage.tsx appelle pour résoudre le tarif de chaque
 * séance via trouverTarifApplicable (src/lib/tarifsContrats.ts) — une seule
 * fonction de lecture, jamais deux requêtes différentes maintenues en
 * parallèle.
 */
export async function chargerTarifsContrat(contratId: string): Promise<TarifContrat[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('tarifs_contrats')
    .select('*')
    .eq('contrat_id', contratId)
    .order('date_debut_validite', { ascending: false });
  if (error) {
    console.error('Erreur chargement des tarifs du contrat:', error);
    return [];
  }
  return (data ?? []).map(dbToTarifContrat);
}

/**
 * Ouvre une nouvelle version de tarif à `dateEffet` (par défaut aujourd'hui, en heure de Paris) selon
 * planChangementTarif (src/lib/tarifsContrats.ts) : la version en vigueur est close la veille, ou remplacée
 * si elle commence le jour même. Ne modifie jamais le tarif ou les frais d'une ligne existante. Les refus de
 * la base (version utilisée par une facture validée) sont affichés en clair. Ne lève jamais.
 */
export async function fermerEtCreerNouvelleVersion(
  contratId: string,
  versionActuelle: TarifContrat | null,
  nouveauTarifSeance: number,
  nouveauxFraisDeplacement: number,
  dateEffet: string = dateCivileParis(),
): Promise<boolean> {
  if (!supabase) return false;
  const plan = planChangementTarif(versionActuelle, dateEffet);
  if ('erreur' in plan) { toast.error(plan.erreur); return false; }

  if (plan.remplacer) {
    const { error } = await supabase.from('tarifs_contrats').delete().eq('id', plan.remplacer);
    if (error) {
      console.error('Erreur remplacement de la version de tarif du même jour:', error);
      toast.error(messageErreurTarif(error.message));
      return false;
    }
  } else if (plan.fermer) {
    const { error } = await supabase
      .from('tarifs_contrats')
      .update({ date_fin_validite: plan.fermer.dateFin })
      .eq('id', plan.fermer.id);
    if (error) {
      console.error('Erreur fermeture de la version de tarif en cours:', error);
      toast.error(messageErreurTarif(error.message));
      return false;
    }
  }

  const { error: errCreation } = await supabase.from('tarifs_contrats').insert(
    tarifContratToDb({
      contratId,
      tarifSeance: nouveauTarifSeance,
      fraisDeplacement: nouveauxFraisDeplacement,
      dateDebutValidite: plan.dateDebut,
      dateFinValidite: undefined,
    }),
  );
  if (errCreation) {
    console.error('Erreur création de la nouvelle version de tarif:', errCreation);
    toast.error(messageErreurTarif(errCreation.message));
    return false;
  }
  return true;
}

/**
 * Historique des tarifs d'un contrat, pour la fiche contrat praticien
 * (ContratsTab.tsx). Chargement lazy par contrat — contrairement à
 * useContrats() qui charge tous les contrats d'un coup, l'historique de
 * tarifs n'a de sens que pour le contrat actuellement affiché.
 */
export function useTarifsContrat(contratId: string | undefined) {
  const [versions, setVersions] = useState<TarifContrat[]>([]);
  const [loading, setLoading] = useState(true);

  const recharger = useCallback(async () => {
    if (!contratId) { setVersions([]); setLoading(false); return; }
    setLoading(true);
    const v = await chargerTarifsContrat(contratId);
    setVersions(v);
    setLoading(false);
  }, [contratId]);

  useEffect(() => { void recharger(); }, [recharger]);

  const versionActuelle = versions.find(v => !v.dateFinValidite) ?? null;
  const historique = versions
    .filter(v => v.dateFinValidite)
    .sort((a, b) => b.dateDebutValidite.localeCompare(a.dateDebutValidite));

  async function modifierTarif(nouveauTarifSeance: number, nouveauxFraisDeplacement: number, dateEffet?: string): Promise<boolean> {
    if (!contratId) return false;
    const ok = await fermerEtCreerNouvelleVersion(contratId, versionActuelle, nouveauTarifSeance, nouveauxFraisDeplacement, dateEffet);
    if (ok) await recharger();
    return ok;
  }

  /**
   * Le premier tarif commence après le début du contrat (cas d'octobre 2026 : tarif saisi en novembre à la
   * date du jour) : ajoute une version close qui couvre l'écart, aux mêmes montants que ce premier tarif.
   * Aucune ligne existante n'est modifiée ; les brouillons de la période sont recalculés par la base.
   */
  async function couvrirDebutContrat(dateDebutContrat: string): Promise<boolean> {
    if (!contratId || !supabase) return false;
    const premiere = [...versions].sort((a, b) => a.dateDebutValidite.localeCompare(b.dateDebutValidite))[0];
    if (!premiere || premiere.dateDebutValidite <= dateDebutContrat) return false;
    const { error } = await supabase.from('tarifs_contrats').insert(tarifContratToDb({
      contratId,
      tarifSeance: premiere.tarifSeance,
      fraisDeplacement: premiere.fraisDeplacement,
      dateDebutValidite: dateDebutContrat,
      dateFinValidite: jourPrecedent(premiere.dateDebutValidite),
    }));
    if (error) {
      console.error('Erreur ajout du tarif du début de contrat:', error);
      toast.error(messageErreurTarif(error.message));
      return false;
    }
    await recharger();
    return true;
  }

  return { versions, versionActuelle, historique, loading, modifierTarif, couvrirDebutContrat, recharger };
}

/**
 * Versions de tarif de plusieurs contrats, en une requête (« Mes stats », 2026-11-24 : valeur des
 * séances prévues du mois et manque à gagner des annulations). Lecture seule, sous la RLS du praticien.
 */
export function useTarifsDesContrats(contratIds: readonly string[]): Record<string, TarifContrat[]> {
  const [tarifs, setTarifs] = useState<Record<string, TarifContrat[]>>({});
  const cle = [...new Set(contratIds)].sort().join(',');
  useEffect(() => {
    let annule = false;
    (async () => {
      const ids = cle ? cle.split(',') : [];
      if (!supabase || ids.length === 0) { setTarifs({}); return; }
      const { data, error } = await supabase
        .from('tarifs_contrats')
        .select('*')
        .in('contrat_id', ids)
        .order('date_debut_validite', { ascending: false });
      if (annule) return;
      if (error) { console.error('[useTarifsDesContrats] lecture :', error); return; }
      const parContrat: Record<string, TarifContrat[]> = {};
      for (const t of (data ?? []).map(dbToTarifContrat)) (parContrat[t.contratId] ??= []).push(t);
      setTarifs(parContrat);
    })();
    return () => { annule = true; };
  }, [cle]);
  return tarifs;
}
