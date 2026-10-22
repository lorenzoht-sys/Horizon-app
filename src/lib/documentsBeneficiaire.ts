// Onglet « Documents » de la fiche bénéficiaire (point D, étape D1) : factures et avoirs émis, et
// comptes rendus partagés (documents_patient). Logique pure, testée (documentsBeneficiaire.test.ts).
//
// Visibilité côté bénéficiaire : MÊME règle que la fonction SQL documents_du_beneficiaire
// (migration 20261030100000), qui servira à l'espace patient (D2). Une facture émise est visible si elle
// est adressée au bénéficiaire, ou, quand un proche paie (payeur FIGÉ dans la facture), si le praticien
// a laissé le réglage « factures_proche_visibles » (oui par défaut). tests/db/documents-beneficiaire.spec.ts
// vérifie que les deux règles donnent le même résultat. Un compte rendu partagé est toujours visible :
// l'espace patient les affiche tous (api/patient/me.ts).

export const SELECT_FACTURES_DOCUMENTS =
  'id, type, numero, periode, date_emission, total, statut, pdf_path, snapshot_destinataire';

export const SELECT_COMPTES_RENDUS = 'id, titre, contenu, type, date_creation';

export interface FactureDocument {
  id: string;
  type: 'facture' | 'avoir';
  numero: string;
  /** AAAA-MM-01 */
  periode: string;
  /** AAAA-MM-JJ */
  dateEmission: string;
  total: number;
  statut: string;
  pdfPath: string | null;
  /** Payeur figé à la validation : un proche (et non le bénéficiaire). */
  payeurProche: boolean;
}

export interface CompteRendu {
  id: string;
  titre: string;
  contenu: string;
  /** ISO, date de partage. */
  dateCreation: string;
}

type Brut = Record<string, unknown>;
const texte = (v: unknown): string => (typeof v === 'string' ? v : '');

export function lireFactureDocument(row: Brut): FactureDocument {
  const dest = row.snapshot_destinataire && typeof row.snapshot_destinataire === 'object' ? row.snapshot_destinataire as Brut : {};
  return {
    id: texte(row.id),
    type: row.type === 'avoir' ? 'avoir' : 'facture',
    numero: texte(row.numero),
    periode: texte(row.periode).slice(0, 10),
    dateEmission: texte(row.date_emission).slice(0, 10),
    total: Number(row.total ?? 0) || 0,
    statut: texte(row.statut),
    pdfPath: texte(row.pdf_path) || null,
    payeurProche: dest.role === 'proche',
  };
}

export function lireCompteRendu(row: Brut): CompteRendu {
  return {
    id: texte(row.id),
    titre: texte(row.titre) || 'Document',
    contenu: texte(row.contenu),
    dateCreation: texte(row.date_creation),
  };
}

/** Règle de documents_du_beneficiaire : émise, et adressée au bénéficiaire ou réglage « proche » laissé à oui. */
export function visibleParBeneficiaire(f: Pick<FactureDocument, 'statut' | 'numero' | 'payeurProche'>, facturesProcheVisibles: boolean): boolean {
  if (f.statut === 'brouillon' || !f.numero) return false;
  return !f.payeurProche || facturesProcheVisibles;
}

/** Plus récentes d'abord, comme la fonction SQL (date d'émission puis numéro). */
export function trierFactures(liste: FactureDocument[]): FactureDocument[] {
  return [...liste].sort((a, b) => b.dateEmission.localeCompare(a.dateEmission) || b.numero.localeCompare(a.numero));
}

export function trierComptesRendus(liste: CompteRendu[]): CompteRendu[] {
  return [...liste].sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));
}

const STATUTS: Record<string, string> = {
  validee: 'Émise', envoyee: 'Envoyée', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
};

/** Libellé du statut d'une facture ; un avoir est toujours « Avoir ». */
export function libelleStatut(f: Pick<FactureDocument, 'type' | 'statut'>): string {
  if (f.type === 'avoir') return 'Avoir';
  return STATUTS[f.statut] ?? f.statut;
}
