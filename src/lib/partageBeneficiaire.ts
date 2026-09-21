// Ce qu'un bénéficiaire voit réellement d'un bilan.
//
// ── Pourquoi ce module existe ─────────────────────────────────────────────
//
// Le partage est CACHÉ PAR DÉFAUT (`bilans.visible_beneficiaire`, défaut
// `'{}'::jsonb`) : le praticien partage consciemment plutôt que de devoir
// penser à cacher. C'est le bon défaut pour de la donnée de santé, et il ne
// change pas.
//
// Mais il ne se disait nulle part. Le 2026-09-14, la page « Progrès » de
// l'espace bénéficiaire apparaissait vide quelles que soient les données
// saisies : les bilans étaient bien récupérés, puis chaque résultat mis à
// `null` par `filtrerBilan` (api/patient/me.ts) faute d'avoir été coché. Rien,
// ni côté praticien ni côté bénéficiaire, ne distinguait « aucune donnée » de
// « données présentes, non partagées ».
//
// S'y ajoutait un piège : `participants.visibilite_beneficiaire.progression`,
// activé par défaut et libellé « Graphiques de progression », ne pilotait que
// l'AFFICHAGE DE L'ONGLET, aucune donnée. Le praticien lisait « partagé » sur
// le seul réglage qui ne partageait rien. Ce réglage a été supprimé : l'onglet
// est toujours visible, et ce module dit ce qui s'y trouve.

import type { Bilan } from '../types';
import { resultatTm6 } from './tm6';

/** Les cinq résultats partageables, dans l'ordre d'affichage. */
export const CLES_PARTAGE = ['equilibre', 'force', 'handGrip', 'mobilite', 'endurance'] as const;
export type ClePartage = (typeof CLES_PARTAGE)[number];

export const LIBELLES_PARTAGE: Record<ClePartage, string> = {
  equilibre: 'Équilibre',
  force: 'Force jambes',
  handGrip: 'Force mains',
  mobilite: 'Mobilité',
  endurance: 'Endurance',
};

export type EtatResultat = {
  cle: ClePartage;
  label: string;
  /** Le test a une valeur dans ce bilan. Sinon il n'y a rien à partager. */
  renseigne: boolean;
  /** La case est cochée : le bénéficiaire voit ce résultat. */
  partage: boolean;
};

/** Valeur du test correspondant à une clé de partage, côté modèle React. */
function valeurResultat(bilan: Bilan, cle: ClePartage): number | null | undefined {
  switch (cle) {
    case 'equilibre': return bilan.equilibre?.droite ?? bilan.equilibre?.gauche;
    case 'force': return bilan.chairStand30;
    case 'handGrip': return bilan.handGrip?.droite ?? bilan.handGrip?.gauche;
    case 'mobilite': return bilan.tug3m;
    case 'endurance': return resultatTm6(bilan.tm6).valeur;
  }
}

/**
 * État de partage des cinq résultats d'un bilan.
 *
 * `renseigne` et `partage` sont distincts à dessein : un résultat non saisi et
 * un résultat saisi mais non coché se ressemblent côté bénéficiaire (rien ne
 * s'affiche) alors qu'ils appellent des actions opposées du praticien —
 * mesurer, ou cocher.
 */
export function etatPartageBilan(bilan: Bilan): EtatResultat[] {
  const visible = bilan.visibleBeneficiaire ?? {};
  return CLES_PARTAGE.map(cle => ({
    cle,
    label: LIBELLES_PARTAGE[cle],
    renseigne: valeurResultat(bilan, cle) != null,
    partage: visible[cle] === true,
  }));
}

export type ResumePartage = {
  /** Résultats saisis ET partagés. */
  partages: number;
  /** Résultats saisis mais non partagés — ceux que le praticien peut cocher. */
  masques: number;
  /** Résultats jamais saisis : rien à partager, aucune action de partage. */
  absents: number;
};

export function resumePartageBilan(bilan: Bilan): ResumePartage {
  const etats = etatPartageBilan(bilan);
  return {
    partages: etats.filter(e => e.renseigne && e.partage).length,
    masques: etats.filter(e => e.renseigne && !e.partage).length,
    absents: etats.filter(e => !e.renseigne).length,
  };
}

/**
 * Un bilan laisse-t-il voir quoi que ce soit au bénéficiaire ?
 *
 * Sert côté bénéficiaire à distinguer « aucun bilan » de « des bilans existent,
 * en attente de partage ». Ne regarde que la PRÉSENCE d'une valeur, jamais sa
 * teneur : le message affiché ne doit rien révéler du contenu.
 */
export function bilanADuContenuVisible(bilan: Bilan): boolean {
  return etatPartageBilan(bilan).some(e => e.renseigne && e.partage);
}

/** Vrai si au moins un bilan de la liste laisse voir un résultat. */
export function auMoinsUnResultatPartage(bilans: Bilan[]): boolean {
  return bilans.some(bilanADuContenuVisible);
}

export type EtatProgres =
  /** Aucun bilan : il n'y a rien, et il n'y a rien à attendre. */
  | { etat: 'aucun_bilan' }
  /** Des bilans existent, aucun résultat n'est partagé. */
  | { etat: 'en_attente_partage' }
  /** Un seul bilan partagé : pas encore de quoi comparer. */
  | { etat: 'un_seul_bilan' }
  /** Des résultats sont partagés, mais aucun test n'est partagé sur DEUX
   *  bilans : impossible de tracer une progression. */
  | { etat: 'partage_non_comparable' }
  | { etat: 'progressions' };

/**
 * Pourquoi la page « Progrès » est vide, quand elle l'est.
 *
 * Les quatre causes demandent des messages différents, et surtout des actions
 * différentes du praticien — mesurer un premier bilan, cocher un partage, ou
 * cocher le MÊME test sur le bilan initial en plus du dernier.
 *
 * `partage_non_comparable` est le cas que le relevé du 2026-09-14 a rendu
 * probable : 14 bilans sur 26 portent au moins un résultat partagé, pour 12
 * bénéficiaires — le mécanisme a donc servi. Or une carte de progression exige
 * le même test partagé sur le bilan initial ET sur le dernier
 * (`calculerProgressions`, EspacePatient.tsx). Cocher les résultats du bilan
 * du jour sans revenir sur le bilan initial ne produit aucune carte.
 */
export function etatProgresBeneficiaire(bilans: Bilan[], nbProgressions: number): EtatProgres {
  if (bilans.length === 0) return { etat: 'aucun_bilan' };
  if (nbProgressions > 0) return { etat: 'progressions' };
  if (!auMoinsUnResultatPartage(bilans)) return { etat: 'en_attente_partage' };
  if (bilans.length < 2) return { etat: 'un_seul_bilan' };
  return { etat: 'partage_non_comparable' };
}

/**
 * Tests partagés sur un bilan mais pas sur l'autre, donc non comparables.
 *
 * Côté praticien uniquement : nomme exactement les cases à cocher pour que la
 * progression apparaisse.
 */
export function resultatsNonComparables(bilanInitial: Bilan, dernierBilan: Bilan): EtatResultat[] {
  const initial = etatPartageBilan(bilanInitial);
  const dernier = etatPartageBilan(dernierBilan);
  return CLES_PARTAGE.flatMap(cle => {
    const a = initial.find(e => e.cle === cle)!;
    const b = dernier.find(e => e.cle === cle)!;
    // Mesuré des deux côtés, partagé d'un seul : une case manque.
    if (a.renseigne && b.renseigne && a.partage !== b.partage) {
      return [a.partage ? b : a];
    }
    return [];
  });
}
