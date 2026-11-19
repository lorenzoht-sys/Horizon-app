import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { utilisateurCourant } from '../lib/session';
import { lireLigneSuivi, type LigneSuivi } from '../lib/suiviSeances';
import { dateCivileParis } from '../lib/tarifsContrats';
import { finSeancesPassees, type ContratIncomplet, type SeanceAConfirmer } from '../lib/controleFacturation';

// Suivi et contrôle de la facturation du mois (PR 6, contrôle du 2026-11-19) :
// - suivi_facturation_seances() : chaque séance réalisée du mois et son état (filtré sur auth.uid()) ;
// - les séances passées du mois restées « planifiées » (jamais facturées tant qu'elles ne sont pas confirmées) ;
// - les contrats à la séance dont le tarif ne couvre pas le début (cause des factures manquantes d'octobre).
// Les noms viennent de `participants` sous la RLS du praticien.

type Brut = Record<string, unknown>;

export function useSuiviSeances(mois: string) {
  const [lignes, setLignes] = useState<LigneSuivi[]>([]);
  const [aConfirmer, setAConfirmer] = useState<SeanceAConfirmer[]>([]);
  const [contrats, setContrats] = useState<ContratIncomplet[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) { setChargement(false); return; }
      setChargement(true);
      const moi = (await utilisateurCourant())?.id;
      const fin = finSeancesPassees(mois, dateCivileParis());
      const [suivi, planifiees, contratsLus] = await Promise.all([
        supabase.rpc('suivi_facturation_seances', { p_mois: mois }),
        fin && moi
          ? supabase.from('seances').select('id, date, heure_debut, participant_id, contrat_id')
            .eq('praticien_id', moi).eq('statut', 'planifiee').gte('date', mois).lte('date', fin)
            .order('date').order('heure_debut')
          : Promise.resolve({ data: [], error: null }),
        moi
          ? supabase.from('contrats')
            .select('id, participant_id, date_debut, participants!inner(praticien_id, beneficiaire_sap, archive)')
            .in('statut', ['actif', 'suspendu']).eq('mode_facturation', 'seance')
            .eq('participants.praticien_id', moi).eq('participants.beneficiaire_sap', false).eq('participants.archive', false)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (annule) return;
      const echec = suivi.error ?? planifiees.error ?? contratsLus.error;
      if (echec) {
        console.error('[useSuiviSeances] lecture :', echec);
        setErreur(echec.message);
        setChargement(false);
        return;
      }

      const lues = ((suivi.data ?? []) as Brut[]).map(lireLigneSuivi);
      const seancesPlanifiees: SeanceAConfirmer[] = ((planifiees.data ?? []) as Brut[]).map(r => ({
        seanceId: String(r.id), date: String(r.date), heure: String(r.heure_debut ?? '').slice(0, 5),
        participantId: String(r.participant_id), contratId: r.contrat_id ? String(r.contrat_id) : null,
      }));

      const brutsContrats = (contratsLus.data ?? []) as Brut[];
      const premiers: Record<string, string> = {};
      if (brutsContrats.length) {
        const t = await supabase.from('tarifs_contrats').select('contrat_id, date_debut_validite')
          .in('contrat_id', brutsContrats.map(c => String(c.id)));
        if (annule) return;
        for (const v of (t.data ?? []) as Brut[]) {
          const id = String(v.contrat_id);
          const d = String(v.date_debut_validite);
          if (!premiers[id] || d < premiers[id]) premiers[id] = d;
        }
      }
      const lusContrats: ContratIncomplet[] = brutsContrats.map(c => ({
        contratId: String(c.id), participantId: String(c.participant_id), dateDebut: String(c.date_debut),
        premierTarif: premiers[String(c.id)] ?? null,
      }));

      const ids = [...new Set([
        ...lues.map(l => l.participantId), ...seancesPlanifiees.map(s => s.participantId), ...lusContrats.map(c => c.participantId),
      ].filter((id): id is string => !!id))];
      const parId: Record<string, string> = {};
      if (ids.length) {
        const r = await supabase.from('participants').select('id, nom, prenom').in('id', ids);
        if (annule) return;
        for (const p of (r.data ?? []) as { id: string; nom: string | null; prenom: string | null }[]) {
          parId[p.id] = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() || 'Bénéficiaire';
        }
      }
      setErreur(null);
      setLignes(lues);
      setAConfirmer(seancesPlanifiees);
      setContrats(lusContrats);
      setNoms(parId);
      setChargement(false);
    })();
    return () => { annule = true; };
  }, [mois, version]);

  /** Confirme une séance passée : réalisée (elle part dans le brouillon du mois) ou annulée. */
  const confirmerSeance = useCallback(async (seanceId: string, statut: 'realisee' | 'annulee'): Promise<string | null> => {
    if (!supabase) return 'Base de données indisponible';
    const { error } = await supabase.from('seances').update({ statut }).eq('id', seanceId).eq('statut', 'planifiee');
    if (error) return error.message;
    setVersion(v => v + 1);
    return null;
  }, []);

  return { lignes, aConfirmer, contrats, noms, chargement, erreur, confirmerSeance };
}
