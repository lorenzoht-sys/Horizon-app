import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface FactureSuivi {
  id: string;
  praticienId: string | null;
  participantId: string;
  periodeMois: number;   // 1-12
  periodeAnnee: number;
  nbSeances: number;
  montantTotal: number;
  statut: 'a_envoyer' | 'en_retard' | 'envoyee';
  dateEcheance: string | null;
  dateEnvoi: string | null;
  notes?: string;
  createdAt: string;
}

function dbToFacture(row: any): FactureSuivi {
  return {
    id: row.id,
    praticienId: row.praticien_id ?? null,
    participantId: row.participant_id,
    periodeMois: row.periode_mois,
    periodeAnnee: row.periode_annee,
    nbSeances: row.nb_seances ?? 0,
    montantTotal: Number(row.montant_total ?? 0),
    statut: row.statut ?? 'a_envoyer',
    dateEcheance: row.date_echeance ?? null,
    dateEnvoi: row.date_envoi ?? null,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? '',
  };
}

export function useFactures() {
  const [factures, setFactures] = useState<FactureSuivi[]>([]);
  const [loading, setLoading] = useState(false);
  const [praticienId, setPraticienId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setPraticienId(user.id);
    });
  }, []);

  const chargerFactures = useCallback(async () => {
    if (!supabase || !praticienId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('factures_suivi')
        .select('*')
        .eq('praticien_id', praticienId)
        .order('periode_annee', { ascending: false })
        .order('periode_mois', { ascending: false });
      if (data) {
        // Mettre à jour le statut 'en_retard' automatiquement
        const today = new Date().toISOString().slice(0, 10);
        const mises = data.map(r => {
          if (r.statut === 'a_envoyer' && r.date_echeance && r.date_echeance < today) {
            return { ...r, statut: 'en_retard' };
          }
          return r;
        });
        setFactures(mises.map(dbToFacture));
      }
    } finally {
      setLoading(false);
    }
  }, [praticienId]);

  useEffect(() => {
    if (praticienId) chargerFactures();
  }, [praticienId, chargerFactures]);

  // Créer ou mettre à jour une facture pour un patient/mois donné
  async function creerOuMettreAJour(data: {
    participantId: string;
    periodeMois: number;
    periodeAnnee: number;
    nbSeances: number;
    montantTotal: number;
    dateEcheance?: string;
  }): Promise<FactureSuivi | null> {
    if (!supabase || !praticienId) return null;

    const today = new Date().toISOString().slice(0, 10);
    const statut: FactureSuivi['statut'] =
      data.dateEcheance && data.dateEcheance < today ? 'en_retard' : 'a_envoyer';

    const row = {
      praticien_id: praticienId,
      participant_id: data.participantId,
      periode_mois: data.periodeMois,
      periode_annee: data.periodeAnnee,
      nb_seances: data.nbSeances,
      montant_total: data.montantTotal,
      statut,
      date_echeance: data.dateEcheance ?? null,
    };

    const { data: inserted, error } = await supabase
      .from('factures_suivi')
      .upsert(row, { onConflict: 'participant_id,periode_annee,periode_mois' })
      .select()
      .single();

    if (error) { console.error('[useFactures] erreur upsert:', error); return null; }
    const facture = dbToFacture(inserted);
    setFactures(prev => {
      const idx = prev.findIndex(
        f => f.participantId === data.participantId &&
             f.periodeMois === data.periodeMois &&
             f.periodeAnnee === data.periodeAnnee
      );
      return idx >= 0 ? prev.map((f, i) => i === idx ? facture : f) : [...prev, facture];
    });
    return facture;
  }

  // Marquer une facture comme envoyée
  async function marquerEnvoyee(id: string, dateEnvoi: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('factures_suivi')
      .update({ statut: 'envoyee', date_envoi: dateEnvoi })
      .eq('id', id);
    if (!error) {
      setFactures(prev => prev.map(f =>
        f.id === id ? { ...f, statut: 'envoyee', dateEnvoi } : f
      ));
    }
  }

  // Supprimer une facture
  async function supprimerFacture(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('factures_suivi').delete().eq('id', id);
    setFactures(prev => prev.filter(f => f.id !== id));
  }

  // Factures par statut (accès rapide)
  const enRetard   = factures.filter(f => f.statut === 'en_retard');
  const aEnvoyer   = factures.filter(f => f.statut === 'a_envoyer');
  const envoyees   = factures.filter(f => f.statut === 'envoyee');

  return {
    factures,
    enRetard,
    aEnvoyer,
    envoyees,
    loading,
    praticienId,
    creerOuMettreAJour,
    marquerEnvoyee,
    supprimerFacture,
    recharger: chargerFactures,
  };
}
