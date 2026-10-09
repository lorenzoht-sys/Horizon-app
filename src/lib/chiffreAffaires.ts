// Logique pure du suivi du chiffre d'affaires mensuel (page /factures/ca, tableau de bord de « Mes stats »).
// Aucune dépendance à Supabase ni à React : tout est testable (src/lib/chiffreAffaires.test.ts).
//
// Règles (décisions du 2026-10-09) : montants en HT ; CA = facturé (factures validées, avoirs déduits),
// pas encaissé ; mois = mois de la PRESTATION. La règle « quelles factures comptent » vit dans la fonction
// SQL chiffre_affaires_mensuel (migration 20261012100000) : ici on ne fait que présenter ses lignes.
// Les saisies externes (SAP...) s'y ajoutent, rattachées à un bénéficiaire ; ce ne sont pas des pièces
// comptables.

/** Une ligne de chiffre_affaires_mensuel : un mois et un bénéficiaire. Montants en HT. */
export interface LigneCA {
  /** Premier jour du mois, AAAA-MM-01. */
  mois: string;
  participantId: string;
  horizon: number;
  externe: number;
}

export interface CaBeneficiaire {
  participantId: string;
  nom: string;
  horizon: number;
  externe: number;
  total: number;
}

export interface DetailMois {
  mois: string;
  horizon: number;
  externe: number;
  total: number;
  beneficiaires: CaBeneficiaire[];
}

/** Une saisie manuelle de CA externe (table ca_externe). */
export interface SaisieExterne {
  id: string;
  participantId: string;
  mois: string;
  libelle: string;
  montant: number;
}

type Brut = Record<string, unknown>;

export const LIBELLE_EXTERNE_PAR_DEFAUT = 'SAP externe';
export const LIBELLE_MAX = 120;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const arrondi = (n: number) => Math.round(n * 100) / 100;

// ── Mois ──────────────────────────────────────────────────────────────────────────────────────

/** Premier jour du mois de `date` (AAAA-MM-JJ ou AAAA-MM) : AAAA-MM-01. */
export function premierDuMois(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Premier jour du mois en cours en date civile Paris (la règle de rattachement des factures se règle sur Paris). */
export function moisCourantParis(instant: Date = new Date()): string {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  return premierDuMois(jour);
}

/** Ajoute `n` mois (négatif pour reculer) à un mois AAAA-MM-01. */
export function ajouterMois(mois: string, n: number): string {
  const [a, m] = mois.split('-').map(Number);
  const index = a * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/** « octobre 2026 » pour 2026-10-01. */
export function libelleMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return `${MOIS[m - 1] ?? '?'} ${a}`;
}

/** Plage SQL couvrant les `n` mois qui se terminent à `mois` (inclus). */
export function plageHistorique(mois: string, n = 12): { debut: string; fin: string } {
  return { debut: ajouterMois(mois, -(n - 1)), fin: mois };
}

// ── Lecture des lignes ────────────────────────────────────────────────────────────────────────

/** Lit une ligne de chiffre_affaires_mensuel (les numeric de PostgREST arrivent en nombre ou en chaîne). */
export function lireLigneCA(row: Brut): LigneCA {
  return {
    mois: String(row.mois),
    participantId: String(row.participant_id),
    horizon: Number(row.ca_horizon ?? 0),
    externe: Number(row.ca_externe ?? 0),
  };
}

export function lireSaisie(row: Brut): SaisieExterne {
  return {
    id: String(row.id),
    participantId: String(row.participant_id),
    mois: String(row.mois),
    libelle: String(row.libelle ?? ''),
    montant: Number(row.montant ?? 0),
  };
}

// ── Agrégation ────────────────────────────────────────────────────────────────────────────────

/** CA total (Horizon + externe) de chaque mois, par clé AAAA-MM-01. */
export function totauxParMois(lignes: LigneCA[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const l of lignes) t[l.mois] = arrondi((t[l.mois] ?? 0) + l.horizon + l.externe);
  return t;
}

/** Détail d'un mois : totaux et une ligne par bénéficiaire, du plus gros CA au plus petit. */
export function detailDuMois(lignes: LigneCA[], mois: string, noms: Record<string, string>): DetailMois {
  const parBenef = new Map<string, CaBeneficiaire>();
  for (const l of lignes.filter(x => x.mois === mois)) {
    const b = parBenef.get(l.participantId) ?? { participantId: l.participantId, nom: noms[l.participantId] ?? 'Bénéficiaire', horizon: 0, externe: 0, total: 0 };
    b.horizon = arrondi(b.horizon + l.horizon);
    b.externe = arrondi(b.externe + l.externe);
    b.total = arrondi(b.horizon + b.externe);
    parBenef.set(l.participantId, b);
  }
  const beneficiaires = [...parBenef.values()]
    .filter(b => b.total !== 0 || b.horizon !== 0 || b.externe !== 0)
    .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'));
  const horizon = arrondi(beneficiaires.reduce((s, b) => s + b.horizon, 0));
  const externe = arrondi(beneficiaires.reduce((s, b) => s + b.externe, 0));
  return { mois, horizon, externe, total: arrondi(horizon + externe), beneficiaires };
}

/** Historique : les `n` mois qui se terminent à `finMois`, du plus récent au plus ancien, mois vides compris. */
export function historique(lignes: LigneCA[], finMois: string, n = 12): { mois: string; horizon: number; externe: number; total: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const mois = ajouterMois(finMois, -i);
    const d = detailDuMois(lignes, mois, {});
    return { mois, horizon: d.horizon, externe: d.externe, total: d.total };
  });
}

/** Format « 2026-10 » → total, utilisé par le tableau de bord de « Mes stats ». */
export function caParMoisCle(lignes: LigneCA[]): Record<string, number> {
  const parMois = totauxParMois(lignes);
  return Object.fromEntries(Object.entries(parMois).map(([mois, total]) => [mois.slice(0, 7), total]));
}

// ── Saisie externe ────────────────────────────────────────────────────────────────────────────

/**
 * Lit un montant saisi à la française (« 1 234,56 », « 1234.5 », « 80 € ») : un nombre strictement
 * positif arrondi au centime, ou null.
 */
export function lireMontant(saisie: string): number | null {
  const propre = saisie.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,})?$/.test(propre)) return null;
  const n = arrondi(Number(propre));
  return n > 0 && n < 1e10 ? n : null;
}

export interface FormulaireSaisie {
  participantId: string;
  libelle: string;
  montant: string;
}

export type ErreursSaisie = Partial<Record<keyof FormulaireSaisie, string>>;

/** Mêmes règles que les contraintes de la base (libellé non vide ≤ 120, montant > 0), annoncées avant l'envoi. */
export function validerSaisie(f: FormulaireSaisie): { erreurs: ErreursSaisie; valeurs: { participantId: string; libelle: string; montant: number } | null } {
  const erreurs: ErreursSaisie = {};
  if (!f.participantId) erreurs.participantId = 'Choisissez un bénéficiaire';
  const libelle = f.libelle.replace(/\s+/g, ' ').trim();
  if (!libelle) erreurs.libelle = 'Indiquez un libellé';
  else if (libelle.length > LIBELLE_MAX) erreurs.libelle = `${LIBELLE_MAX} caractères au plus`;
  const montant = lireMontant(f.montant);
  if (montant === null) erreurs.montant = 'Indiquez un montant supérieur à 0';
  const ok = Object.keys(erreurs).length === 0 && montant !== null;
  return { erreurs, valeurs: ok ? { participantId: f.participantId, libelle, montant } : null };
}
