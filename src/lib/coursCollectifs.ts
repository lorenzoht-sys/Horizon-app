// Cours collectifs : résolution des unités facturables, en mode individuel
// et en mode structure. Fonctions pures — le calcul du montant lui-même
// reste entièrement délégué à trouverTarifApplicable/totalFactureSeance
// (src/lib/tarifsContrats.ts) pour le mode individuel : aucune duplication
// de logique de tarif ici, uniquement la sélection des dates à facturer.

import type { CoursCollectif, ParticipationCoursCollectif } from '../types';

/**
 * Dates des cours collectifs en mode individuel où ce participant était
 * présent, cours réalisés (jamais planifié ni annulé) dans la période
 * donnée. Chaque date résultante se résout ensuite via
 * trouverTarifApplicable, exactement comme une séance classique — c'est à
 * l'appelant (StatsPage.tsx) de faire la somme avec ses propres séances et
 * de résoudre le tarif.
 */
export function datesCoursCollectifsIndividuelFacturables(
  cours: CoursCollectif[],
  participations: ParticipationCoursCollectif[],
  participantId: string,
  debut: string,
  fin: string,
): string[] {
  const datesCoursEligibles = new Map(
    cours
      .filter(c =>
        c.modeFacturation === 'individuel' &&
        c.statut === 'realise' &&
        c.date >= debut && c.date <= fin
      )
      .map(c => [c.id, c.date]),
  );

  return participations
    .filter(p =>
      p.participantId === participantId &&
      p.statutPresence === 'present' &&
      datesCoursEligibles.has(p.coursId)
    )
    .map(p => datesCoursEligibles.get(p.coursId) as string);
}

/**
 * Cours collectifs facturables à une structure : mode structure, réalisés,
 * dans la période. Chaque cours compte pour UNE unité au tarif forfaitaire
 * de la structure, quel que soit le nombre de participants présents — la
 * facturation structure ne génère jamais de facture individuelle par
 * bénéficiaire (voir StructureDetail.tsx, genererFactureMois).
 */
export function coursCollectifsStructureFacturables(
  cours: CoursCollectif[],
  structureId: string,
  debut: string,
  fin: string,
): CoursCollectif[] {
  return cours.filter(c =>
    c.modeFacturation === 'structure' &&
    c.statut === 'realise' &&
    c.structureId === structureId &&
    c.date >= debut && c.date <= fin
  );
}
