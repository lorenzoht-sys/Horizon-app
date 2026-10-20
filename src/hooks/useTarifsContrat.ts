import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { TarifContrat } from '../types';
import { supabase } from '../lib/supabase';
import { dbToTarifContrat, tarifContratToDb } from '../lib/mappers';
import { dateCivileParis, messageErreurTarif, planChangementTarif } from '../lib/tarifsContrats';

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

  return { versions, versionActuelle, historique, loading, modifierTarif, recharger };
}
