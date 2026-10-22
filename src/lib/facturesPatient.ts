// Section « Factures » de l'écran Documents de l'espace patient (point D, D2). Les données viennent de
// /api/patient/me (api/_lib/facturesPatient.ts : déjà filtrées par documents_du_beneficiaire, sans chemin
// de fichier) ; le PDF s'obtient par une URL signée de 60 s (patientUrlPdfFacture).

export interface FacturePatient {
  id: string;
  type: 'facture' | 'avoir';
  numero: string;
  /** AAAA-MM-01 */
  periode: string;
  /** AAAA-MM-JJ */
  dateEmission: string;
  total: number;
  statut: string;
  pdfDisponible: boolean;
}

/**
 * Statut dit au bénéficiaire, sans vocabulaire de relance : « En retard » devient « À régler » comme une
 * facture simplement émise ; le suivi des retards reste côté praticien.
 */
export function etatPourBeneficiaire(f: Pick<FacturePatient, 'type' | 'statut'>): { libelle: string; ton: 'neutre' | 'ok' | 'attente' } {
  if (f.type === 'avoir') return { libelle: 'Avoir', ton: 'neutre' };
  if (f.statut === 'payee') return { libelle: 'Réglée', ton: 'ok' };
  if (f.statut === 'annulee') return { libelle: 'Annulée', ton: 'neutre' };
  return { libelle: 'À régler', ton: 'attente' };
}

/** Plus récentes d'abord (le serveur les trie déjà ; l'écran ne dépend pas de l'ordre reçu). */
export function trierFacturesPatient(liste: FacturePatient[]): FacturePatient[] {
  return [...liste].sort((a, b) => b.dateEmission.localeCompare(a.dateEmission) || b.numero.localeCompare(a.numero));
}
