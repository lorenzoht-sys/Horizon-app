// Factures dans l'espace patient (point D, étape D2).
//
// La liste vient EXCLUSIVEMENT de documents_du_beneficiaire (migration 20261030100000, réservée à
// service_role) : factures et avoirs émis, jamais un brouillon, et le réglage « proche payeur » du
// praticien appliqué sur le payeur figé dans la facture. Le participant vient toujours du jeton patient,
// jamais du client.
//
// Ce qui sort vers le navigateur : numéro, type, période, date, total, statut, et un booléen « PDF
// disponible ». Jamais le chemin du fichier dans le bucket (il contient l'id du praticien) : le PDF se
// télécharge par une URL signée de 60 s, demandée au moment du clic (type 'facture-pdf' de
// /api/patient/activite, plafond de 12 fonctions Vercel), et délivrée seulement si la facture figure dans
// la liste du bénéficiaire. Une facture inconnue, d'un autre bénéficiaire ou masquée : même 404.

import type { SupabaseClient } from '@supabase/supabase-js';

export const DUREE_URL_PDF_SECONDES = 60;
const BUCKET = 'factures';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ligne rendue par documents_du_beneficiaire. */
export interface LigneDocumentBeneficiaire {
  id: string;
  type: string;
  numero: string;
  periode: string;
  date_emission: string;
  total: number | string;
  statut: string;
  pdf_path: string | null;
  payeur_proche: boolean;
}

/** Ce que reçoit le navigateur du bénéficiaire. */
export interface FacturePatient {
  id: string;
  type: 'facture' | 'avoir';
  numero: string;
  periode: string;
  dateEmission: string;
  total: number;
  statut: string;
  pdfDisponible: boolean;
}

export function exposerFacture(l: LigneDocumentBeneficiaire): FacturePatient {
  return {
    id: l.id,
    type: l.type === 'avoir' ? 'avoir' : 'facture',
    numero: l.numero,
    periode: String(l.periode).slice(0, 10),
    dateEmission: String(l.date_emission).slice(0, 10),
    total: Number(l.total) || 0,
    statut: l.statut,
    pdfDisponible: !!l.pdf_path,
  };
}

async function documentsDuBeneficiaire(supabase: SupabaseClient, participantId: string): Promise<LigneDocumentBeneficiaire[]> {
  const { data, error } = await supabase.rpc('documents_du_beneficiaire', { p_participant_id: participantId });
  if (error) throw new Error(error.message);
  return (data ?? []) as LigneDocumentBeneficiaire[];
}

/** Liste pour /api/patient/me. Une panne ne prive pas le bénéficiaire du reste de son espace : liste vide. */
export async function lireFacturesPatient(supabase: SupabaseClient, participantId: string): Promise<FacturePatient[]> {
  try {
    return (await documentsDuBeneficiaire(supabase, participantId)).map(exposerFacture);
  } catch (e) {
    console.error('[facturesPatient] lecture impossible :', e instanceof Error ? e.message : e);
    return [];
  }
}

export type ResultatUrlPdf =
  | { ok: true; url: string; numero: string }
  | { ok: false; statut: 400 | 404 | 409 | 500; erreur: string; motif: string };

/**
 * URL signée (60 s) du PDF d'une facture DU bénéficiaire du jeton. La facture doit figurer dans
 * documents_du_beneficiaire : sinon 404, sans dire si elle existe (un 403 le confirmerait).
 */
export async function urlPdfFacturePatient(supabase: SupabaseClient, participantId: string, factureId: unknown): Promise<ResultatUrlPdf> {
  if (typeof factureId !== 'string' || !UUID.test(factureId)) {
    return { ok: false, statut: 400, erreur: 'Paramètres invalides', motif: 'parametres' };
  }
  let liste: LigneDocumentBeneficiaire[];
  try {
    liste = await documentsDuBeneficiaire(supabase, participantId);
  } catch (e) {
    console.error('[facturesPatient] lecture impossible :', e instanceof Error ? e.message : e);
    return { ok: false, statut: 500, erreur: 'Erreur serveur', motif: 'lecture' };
  }
  const f = liste.find(l => l.id === factureId);
  if (!f) return { ok: false, statut: 404, erreur: 'Facture introuvable', motif: 'introuvable' };
  if (!f.pdf_path) return { ok: false, statut: 409, erreur: 'Le PDF de cette facture est en préparation', motif: 'pdf_absent' };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.pdf_path, DUREE_URL_PDF_SECONDES, {
    download: `${f.type === 'avoir' ? 'Avoir' : 'Facture'}-${f.numero}.pdf`,
  });
  if (error || !data?.signedUrl) {
    console.error('[facturesPatient] URL signée impossible :', f.numero, error?.message ?? '');
    return { ok: false, statut: 500, erreur: 'Erreur serveur', motif: 'url' };
  }
  return { ok: true, url: data.signedUrl, numero: f.numero };
}
