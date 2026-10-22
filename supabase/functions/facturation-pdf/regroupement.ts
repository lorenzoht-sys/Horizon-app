// Présentation « globale » d'une facture (point A, étape A2, décisions du 2026-10-22). Module PUR et
// SANS import : il est chargé par l'Edge Function (composer.ts), par Vitest et par le front (aperçu
// de l'écran « Factures à valider », src/lib/facturesAValider.ts), pour que l'aperçu et le PDF
// regroupent les lignes exactement de la même façon.
//
// En base, rien ne change : toujours une ligne par séance (suivi, anti-double facturation, avoirs par
// séance). Le regroupement n'existe qu'à l'affichage. Le mode vient de factures.presentation, figé à la
// validation (migration 20261028100000) ; NULL (factures antérieures) se lit « detaillee ».
//
// Règle :
//   - les lignes de séance (et de bilan) et les lignes « Frais de déplacement » deviennent UNE ligne :
//     « Accompagnement en activité physique adaptée — septembre 2026 : 4 séances, déplacements inclus »,
//     quantité 1, montant = leur somme. Le total de la facture est donc inchangé ;
//   - les bilans sont comptés à part (« 4 séances et 1 bilan ») : un bilan n'est pas une séance ;
//   - « , déplacements inclus » seulement s'il y a des frais de déplacement à inclure ;
//   - les autres lignes (forfait, geste commercial d'un avoir) restent telles quelles, après ;
//   - sans aucune ligne de séance (forfait, avoir sur les seuls frais) : rien n'est regroupé.

export type Presentation = 'detaillee' | 'globale';

/** Ce que le regroupement lit d'une ligne ; le reste de l'objet est conservé pour les lignes non regroupées. */
export interface LigneRegroupable {
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  seanceDate?: string | null;
  seanceType?: string | null;
}

export const LIBELLE_ACCOMPAGNEMENT = 'Accompagnement en activité physique adaptée';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Valeur de factures.presentation (ou du réglage) lue sans confiance : tout ce qui n'est pas « globale » est détaillé. */
export function lirePresentation(v: unknown): Presentation {
  return v === 'globale' ? 'globale' : 'detaillee';
}

export function estLigneFrais(l: { libelle: string; seanceDate?: string | null }): boolean {
  return !l.seanceDate && /^Frais de déplacement\b/.test(l.libelle);
}

function nombre(n: number, singulier: string, pluriel: string): string {
  const texte = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${texte} ${n > 1 ? pluriel : singulier}`;
}

/** « septembre 2026 » depuis la période AAAA-MM-01. */
function mois(periode: string): string {
  const m = /^(\d{4})-(\d{2})-/.exec(periode);
  return m ? `${MOIS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : periode;
}

/**
 * Lignes à afficher pour le mode donné. En « detaillee », les lignes reçues telles quelles (même
 * tableau). En « globale », la ligne d'accompagnement suivie des lignes non regroupables.
 */
export function lignesAffichees<L extends LigneRegroupable>(lignes: L[], presentation: Presentation, periode: string): (L | LigneRegroupable)[] {
  if (presentation !== 'globale') return lignes;
  const seances = lignes.filter(l => l.seanceDate);
  if (seances.length === 0) return lignes;
  const frais = lignes.filter(estLigneFrais);
  const autres = lignes.filter(l => !l.seanceDate && !estLigneFrais(l));

  const nbBilans = seances.filter(l => l.seanceType === 'bilan').reduce((s, l) => s + l.quantite, 0);
  const nbSeances = seances.filter(l => l.seanceType !== 'bilan').reduce((s, l) => s + l.quantite, 0);
  const compte = [
    nbSeances > 0 ? nombre(nbSeances, 'séance', 'séances') : '',
    nbBilans > 0 ? nombre(nbBilans, 'bilan', 'bilans') : '',
  ].filter(Boolean).join(' et ');
  // Somme au centime, comme les montants de la base (numeric(10,2)).
  const montant = Math.round([...seances, ...frais].reduce((s, l) => s + l.montant * 100, 0)) / 100;

  const globale: LigneRegroupable = {
    libelle: `${LIBELLE_ACCOMPAGNEMENT} — ${mois(periode)} : ${compte}${frais.length > 0 ? ', déplacements inclus' : ''}`,
    quantite: 1,
    prixUnitaire: montant,
    montant,
    seanceDate: null,
    seanceType: null,
  };
  return [globale, ...autres];
}
