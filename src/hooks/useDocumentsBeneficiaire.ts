import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  SELECT_COMPTES_RENDUS,
  SELECT_FACTURES_DOCUMENTS,
  lireCompteRendu,
  lireFactureDocument,
  trierComptesRendus,
  trierFactures,
  type CompteRendu,
  type FactureDocument,
} from '../lib/documentsBeneficiaire';

// Documents d'UN bénéficiaire vus par le praticien (onglet « Documents », point D, D1) : lecture directe
// sous la RLS du praticien (factures, documents_patient, praticiens), sans route /api. Les brouillons
// restent dans « Factures à valider » : seuls les documents émis sont listés ici.

export function useDocumentsBeneficiaire(participantId: string) {
  const [factures, setFactures] = useState<FactureDocument[]>([]);
  const [comptesRendus, setComptesRendus] = useState<CompteRendu[]>([]);
  const [facturesProcheVisibles, setFacturesProcheVisibles] = useState(true);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const client = supabase;
    if (!client) { setChargement(false); return; }
    const { data: { user } } = await client.auth.getUser();
    const [f, d, p] = await Promise.all([
      client.from('factures').select(SELECT_FACTURES_DOCUMENTS).eq('participant_id', participantId).neq('statut', 'brouillon'),
      client.from('documents_patient').select(SELECT_COMPTES_RENDUS).eq('participant_id', participantId),
      user ? client.from('praticiens').select('factures_proche_visibles').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const e = f.error ?? d.error ?? p.error;
    if (e) {
      console.error('[useDocumentsBeneficiaire] lecture :', e);
      setErreur(e.message);
    } else {
      setErreur(null);
      setFactures(trierFactures(((f.data ?? []) as unknown as Record<string, unknown>[]).map(lireFactureDocument)));
      setComptesRendus(trierComptesRendus(((d.data ?? []) as unknown as Record<string, unknown>[]).map(lireCompteRendu)));
      setFacturesProcheVisibles((p.data as { factures_proche_visibles?: boolean } | null)?.factures_proche_visibles !== false);
    }
    setChargement(false);
  }, [participantId]);

  useEffect(() => { void charger(); }, [charger]);

  return { factures, comptesRendus, facturesProcheVisibles, chargement, erreur, rafraichir: charger };
}
