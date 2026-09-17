import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { TarifContrat } from '../types';
import { supabase } from '../lib/supabase';
import { dbToTarifContrat, tarifContratToDb } from '../lib/mappers';

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
 * Ferme la version actuelle (date_fin_validite = veille d'aujourd'hui) et
 * crée une nouvelle version à partir d'aujourd'hui. Ne modifie jamais le
 * tarif ou les frais d'une ligne existante — seule sa date de fin change,
 * et uniquement pour la clore.
 *
 * Cas particulier : si la version actuelle a déjà été ouverte AUJOURD'HUI
 * (double modification le même jour, avant qu'aucune séance n'ait pu s'y
 * facturer), la fermer avec « veille » produirait une période invalide
 * (fin avant son propre début — rejeté par la contrainte
 * tarifs_contrats_periode_valide). Dans ce cas précis, cette version toute
 * fraîche est supprimée plutôt que fermée : elle n'a jamais réellement été
 * la version "en vigueur" pour une quelconque séance passée, donc rien de
 * verrouillé n'est perdu.
 */
export async function fermerEtCreerNouvelleVersion(
  contratId: string,
  versionActuelle: TarifContrat | null,
  nouveauTarifSeance: number,
  nouveauxFraisDeplacement: number,
): Promise<boolean> {
  if (!supabase) return false;
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const veille = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (versionActuelle) {
    if (versionActuelle.dateDebutValidite >= aujourdHui) {
      const { error } = await supabase.from('tarifs_contrats').delete().eq('id', versionActuelle.id);
      if (error) {
        console.error('Erreur correction de la version de tarif du jour:', error);
        toast.error('Erreur : ' + error.message);
        return false;
      }
    } else {
      const { error } = await supabase
        .from('tarifs_contrats')
        .update({ date_fin_validite: veille })
        .eq('id', versionActuelle.id);
      if (error) {
        console.error('Erreur fermeture de la version de tarif en cours:', error);
        toast.error('Erreur : ' + error.message);
        return false;
      }
    }
  }

  const { error: errCreation } = await supabase.from('tarifs_contrats').insert(
    tarifContratToDb({
      contratId,
      tarifSeance: nouveauTarifSeance,
      fraisDeplacement: nouveauxFraisDeplacement,
      dateDebutValidite: aujourdHui,
      dateFinValidite: undefined,
    }),
  );
  if (errCreation) {
    console.error('Erreur création de la nouvelle version de tarif:', errCreation);
    toast.error('Erreur : ' + errCreation.message);
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

  async function modifierTarif(nouveauTarifSeance: number, nouveauxFraisDeplacement: number): Promise<boolean> {
    if (!contratId) return false;
    const ok = await fermerEtCreerNouvelleVersion(contratId, versionActuelle, nouveauTarifSeance, nouveauxFraisDeplacement);
    if (ok) await recharger();
    return ok;
  }

  return { versions, versionActuelle, historique, loading, modifierTarif, recharger };
}
