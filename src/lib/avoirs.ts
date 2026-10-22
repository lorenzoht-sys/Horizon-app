// Avoirs (plan facturation PR 9) : calcul du montant affiché dans la fenêtre de confirmation, avant
// l'appel à creer_avoir (migration 20261027100000). Logique pure, testée à côté.
//
// Le montant affiché doit être EXACTEMENT celui que la base calculera : il est passé à creer_avoir
// (p_total_attendu), qui refuse tout écart. Mêmes règles que la base, en centimes entiers :
//   * lignes en HT, montant = arrondi(quantité × prix unitaire) ;
//   * TVA = arrondi(HT × taux / 100) au taux de la facture d'origine (valider_facture) ;
//   * « solde » : quand le cumul HT des avoirs atteint le HT d'origine, la TVA de ce dernier avoir est le
//     reste exact de la TVA d'origine (trigger factures_avoir_controle) ;
//   * le cumul TTC des avoirs ne dépasse jamais le total d'origine ; s'il l'atteint, l'origine est annulée.
// Arrondi : numeric de Postgres, au plus proche, moitié en s'éloignant de zéro (montants toujours >= 0 ici).

export interface LigneOrigine {
  id: string;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  seanceId: string | null;
}

/** Ligne d'un avoir déjà émis qui crédite une ligne de l'origine. */
export interface Credit { ligneOrigineId: string; quantite: number }

export interface Montants { totalHt: number; montantTva: number; total: number }

export interface Choix { ligneId: string; quantite: number }

const cts = (euros: number): number => Math.round(euros * 100);
const eur = (centimes: number): number => centimes / 100;
/** arrondi(centimes × taux / 100), taux à 2 décimales au plus (5,5 ; 10…), sans flottant. */
function tvaCentimes(htCentimes: number, taux: number): number {
  const tauxCentiemes = Math.round(taux * 100);           // 5,5 % -> 550
  return Math.floor((htCentimes * tauxCentiemes + 5000) / 10000);
}

/** Quantité encore créditable d'une ligne de l'origine (jamais négative). */
export function quantiteRestante(ligne: LigneOrigine, credits: Credit[]): number {
  const deja = credits.filter(c => c.ligneOrigineId === ligne.id).reduce((t, c) => t + cts(c.quantite), 0);
  return Math.max(eur(cts(ligne.quantite) - deja), 0);
}

export interface CalculAvoir {
  totalHt: number;
  montantTva: number;
  total: number;
  /** Reste créditable de l'origine AVANT cet avoir (TTC). */
  resteCreditable: number;
  depasse: boolean;
  /** Cet avoir porte le cumul au total d'origine : la facture sera annulée. */
  annuleOrigine: boolean;
}

export function calculerAvoir(
  origine: Montants & { tauxTva: number },
  lignes: LigneOrigine[],
  choix: Choix[],
  geste: number,
  precedents: Montants[],
): CalculAvoir {
  const parId = new Map(lignes.map(l => [l.id, l]));
  let ht = 0;
  for (const c of choix) {
    const l = parId.get(c.ligneId);
    if (l && c.quantite > 0) ht += Math.round(cts(c.quantite) * cts(l.prixUnitaire) / 100);
  }
  if (geste > 0) ht += cts(geste);

  const precHt = precedents.reduce((t, a) => t + cts(a.totalHt), 0);
  const precTva = precedents.reduce((t, a) => t + cts(a.montantTva), 0);
  const precTtc = precedents.reduce((t, a) => t + cts(a.total), 0);
  const solde = precHt + ht === cts(origine.totalHt);
  const tva = solde ? cts(origine.montantTva) - precTva : tvaCentimes(ht, origine.tauxTva);
  const total = ht + tva;
  const reste = cts(origine.total) - precTtc;
  return {
    totalHt: eur(ht), montantTva: eur(tva), total: eur(total),
    resteCreditable: eur(reste),
    depasse: total > reste,
    annuleOrigine: total > 0 && total === reste,
  };
}

/** Somme déjà encaissée au-delà de ce qui reste dû après les avoirs : à rembourser hors d'Horizon. */
export function aRembourser(paye: number, totalOrigine: number, totalAvoirs: number): number {
  return eur(Math.max(cts(paye) - (cts(totalOrigine) - cts(totalAvoirs)), 0));
}

/** Motif saisi : obligatoire, 500 caractères au plus (contrainte factures_motif_avoir). */
export function motifValide(motif: string): boolean {
  const m = motif.trim();
  return m.length > 0 && m.length <= 500;
}
