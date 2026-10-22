import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Choix, Credit, LigneOrigine } from '../lib/avoirs';
import {
  SELECT_BROUILLON,
  SELECT_FACTURE_VALIDEE,
  SELECT_PROFIL,
  lireBrouillon,
  lireFactureValidee,
  lireProfil,
  messageValidationLisible,
  nomFichierFacture,
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
// Un praticien ne lit que ses factures (policy factures_praticien), et la RLS reste la seule
// garantie de sécurité. Les requêtes ci-dessous filtrent pourtant EXPLICITEMENT sur le praticien
// connecté : un compte ADMIN lit toutes les factures par la RLS (lecture seule voulue, policy
// factures_admin_lecture) mais PAS les bénéficiaires des autres praticiens. Sans ce filtre, l'admin
// voyait ici les brouillons de toute la plateforme, titrés « Bénéficiaire » et tous signalés
// « il manque la rue, le code postal et la ville » faute de pouvoir lire le bénéficiaire (constaté en
// prod le 2026-10-18), sans pouvoir les valider pour autant (valider_facture refuse un autre
// praticien). Ces écrans sont ceux du praticien : on n'y montre que SES factures.

export function useFacturesAValider() {
  const [brouillons, setBrouillons] = useState<FactureBrouillon[]>([]);
  const [profil, setProfil] = useState<ProfilFacturation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());

  const charger = useCallback(async () => {
    if (!supabase) { setChargement(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBrouillons([]); setProfil(null); setChargement(false); return; }
    const [fb, pr] = await Promise.all([
      supabase
        .from('factures')
        .select(SELECT_BROUILLON)
        .eq('praticien_id', user.id)
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

/**
 * Télécharge le PDF d'une facture validée depuis le bucket privé `factures`, sous la session du
 * praticien (la RLS de storage.objects ne lui laisse lire que son dossier) : aucune route /api,
 * aucun lien durable. Ne lève jamais.
 */
/**
 * Fenêtre « Créer un avoir » (PR 9) : lignes de la facture d'origine et ce que ses avoirs émis en ont déjà
 * crédité (lignes_facture.ligne_origine_id). Lecture sous la RLS du praticien.
 */
export async function chargerLignesAvoir(factureId: string, avoirIds: string[]): Promise<{ lignes: LigneOrigine[]; credits: Credit[] } | { erreur: string }> {
  if (!supabase) return { erreur: 'Base de données indisponible' };
  const { data, error } = await supabase.from('lignes_facture')
    .select('id, libelle, quantite, prix_unitaire, montant, seance_id, seances(date, heure_debut)')
    .eq('facture_id', factureId);
  if (error) return { erreur: error.message };
  let credits: Credit[] = [];
  if (avoirIds.length > 0) {
    const c = await supabase.from('lignes_facture').select('ligne_origine_id, quantite').in('facture_id', avoirIds).not('ligne_origine_id', 'is', null);
    if (c.error) return { erreur: c.error.message };
    credits = (c.data ?? []).map(r => ({ ligneOrigineId: String(r.ligne_origine_id), quantite: Number(r.quantite) }));
  }
  type Brute = { id: string; libelle: string; quantite: unknown; prix_unitaire: unknown; montant: unknown; seance_id: string | null; seances: unknown };
  const cle = (r: Brute) => {
    const s = (Array.isArray(r.seances) ? r.seances[0] : r.seances) as { date?: string; heure_debut?: string } | null;
    // Même ordre que le PDF : séances par date et heure, puis lignes sans séance par libellé.
    return s?.date ? `0${s.date}${s.heure_debut ?? ''}` : `1${r.libelle}`;
  };
  const lignes = ((data ?? []) as unknown as Brute[]).sort((a, b) => cle(a).localeCompare(cle(b))).map(r => ({
    id: r.id, libelle: r.libelle, quantite: Number(r.quantite), prixUnitaire: Number(r.prix_unitaire), montant: Number(r.montant), seanceId: r.seance_id,
  }));
  return { lignes, credits };
}

export async function telechargerPdfFacture(pdfPath: string, numero: string): Promise<{ ok: true } | { erreur: string }> {
  if (!supabase) return { erreur: 'Base de données indisponible' };
  const { data, error } = await supabase.storage.from('factures').download(pdfPath);
  if (error || !data) return { erreur: 'Le PDF est introuvable ou inaccessible' };
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichierFacture(numero);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { ok: true };
}

/** Factures déjà validées (numérotées, verrouillées). */
export function useFacturesValidees() {
  const [factures, setFactures] = useState<FactureValidee[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      if (!supabase) { setChargement(false); return; }
      // Mêmes raisons que pour les brouillons (voir l'en-tête) : seulement les factures du praticien connecté.
      const { data: { user } } = await supabase.auth.getUser();
      if (annule) return;
      if (!user) { setFactures([]); setChargement(false); return; }
      const { data, error } = await supabase
        .from('factures')
        .select(SELECT_FACTURE_VALIDEE)
        .eq('praticien_id', user.id)
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
  }, [version]);

  /**
   * « Marquer payée » (PR 7) : marquer_facture_payee() enregistre UN paiement du reste dû (RLS de
   * paiements) et le statut suit par trigger. On relit ensuite la liste : ce qui s'affiche est la base.
   */
  const marquerPayee = useCallback(async (factureId: string, date: string, moyen: string): Promise<{ ok: true } | { erreur: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const { error } = await supabase.rpc('marquer_facture_payee', { p_facture_id: factureId, p_date: date, p_moyen: moyen });
    if (error) return { erreur: error.message };
    setVersion(v => v + 1);
    return { ok: true };
  }, []);

  /**
   * « Envoyer » / « Renvoyer » (PR 8) : Edge Function facturation-envoi, avec le jeton du praticien.
   * `envoiId` est tiré par l'appelant à chaque clic : clé d'idempotence côté Resend.
   */
  const envoyer = useCallback(async (factureId: string, envoiId: string, email?: string, enregistrerEmail = false):
    Promise<{ ok: true; destinataire: string; enregistree: boolean } | { code?: string; erreur: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const { data, error } = await supabase.functions.invoke('facturation-envoi', {
      body: { facture_id: factureId, envoi_id: envoiId, ...(email ? { email, enregistrer_email: enregistrerEmail } : {}) },
    });
    if (error) {
      // FunctionsHttpError : le corps JSON de la fonction porte le code et le message lisible.
      const corps = await (error as { context?: Response }).context?.json?.().catch(() => null);
      return { code: corps?.code, erreur: corps?.erreur ?? error.message };
    }
    setVersion(v => v + 1);
    return { ok: true, destinataire: String(data?.destinataire ?? ''), enregistree: data?.enregistree === true };
  }, []);

  /**
   * « Créer un avoir » (PR 9) : creer_avoir crée l'avoir, le valide (numéro définitif) et met à jour la
   * facture d'origine en une transaction. `totalAttendu` est le montant affiché : la base refuse tout écart.
   */
  const creerAvoir = useCallback(async (factureId: string, lignes: Choix[], geste: number, motif: string, totalAttendu: number):
    Promise<{ ok: true; numero: string; total: number; origineAnnulee: boolean; aRembourser: number } | { erreur: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const { data, error } = await supabase.rpc('creer_avoir', {
      p_facture_id: factureId,
      p_lignes: lignes.map(l => ({ ligne_id: l.ligneId, quantite: l.quantite })),
      p_geste: geste > 0 ? geste : null,
      p_motif: motif.trim(),
      p_total_attendu: totalAttendu,
    });
    if (error) return { erreur: error.message };
    setVersion(v => v + 1);
    const r = (data ?? {}) as Record<string, unknown>;
    return { ok: true, numero: String(r.numero ?? ''), total: Number(r.total ?? 0), origineAnnulee: r.origine_annulee === true, aRembourser: Number(r.a_rembourser ?? 0) };
  }, []);

  /** « Refaire la facture du mois » (PR 9) : après une annulation totale, recrée le brouillon depuis les séances libérées. */
  const refaireFacture = useCallback(async (contratId: string, periode: string): Promise<{ ok: true; cree: boolean } | { erreur: string }> => {
    if (!supabase) return { erreur: 'Base de données indisponible' };
    const { data, error } = await supabase.rpc('generer_brouillon_facture', { p_contrat_id: contratId, p_periode: periode });
    if (error) return { erreur: error.message };
    setVersion(v => v + 1);
    return { ok: true, cree: data != null };
  }, []);

  return { factures, chargement, erreur, marquerPayee, envoyer, creerAvoir, refaireFacture };
}
