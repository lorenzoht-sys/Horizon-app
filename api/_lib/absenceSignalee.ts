// Signalement d'ABSENCE par le bénéficiaire pour SA PROCHAINE séance planifiée
// (rendez-vous individuel — distinct de seances_patient, qui journalise les
// séances d'entraînement d'un programme, sans rapport avec un rendez-vous).
// Validation de la demande et règle « jusqu'au début de la séance » —
// fonctions pures, testées ; la route est dans api/patient/activite.ts.
//
// Même fenêtre EXACTE que la présence annoncée aux cours collectifs
// (api/_lib/presenceAnnoncee.ts) : aucune tolérance après l'instant de
// début, réutilise directement instantDebutCours (calcul Europe/Paris déjà
// écrit et testé là-bas, pas de raison d'en avoir un second).
//
// N'écrit rien sur `statut` : une séance signalée reste 'planifiee'. C'est
// une information pour le praticien, pas un changement d'état — voir la
// migration 20260928_absence_signalee_seances.sql pour le détail des tables
// et calculs qui n'en dépendent pas (tournée, contrats, séances restantes,
// facturation).

import { instantDebutCours } from './presenceAnnoncee.js';

export type CorpsSeanceAbsence =
  | { ok: true; signale: boolean }
  | { ok: false; erreur: string };

/**
 * Valide le corps AVANT toute requête. Pas d'identifiant de séance dans le
 * corps (décidé) : l'action porte TOUJOURS sur la prochaine séance planifiée
 * du participant, retrouvée côté serveur à partir du seul jeton — aucun id à
 * manipuler, donc aucune surface IDOR sur cette action (contrairement à
 * cours-presence, où le bénéficiaire a plusieurs cours à venir parmi
 * lesquels choisir).
 */
export function validerCorpsSeanceAbsence(body: unknown): CorpsSeanceAbsence {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.signale !== 'boolean') {
    return { ok: false, erreur: 'signale invalide : booléen requis' };
  }
  return { ok: true, signale: b.signale };
}

export type RefusAbsence = 'seance_realisee' | 'seance_annulee' | 'seance_reportee' | 'seance_invalide' | 'deja_commencee';

export const MESSAGES_REFUS_ABSENCE: Record<RefusAbsence, string> = {
  seance_realisee: 'Cette séance a déjà eu lieu.',
  seance_annulee: 'Cette séance est annulée.',
  seance_reportee: 'Cette séance a été reportée.',
  seance_invalide: 'Cette séance ne peut pas recevoir de signalement.',
  deja_commencee: 'Cette séance a déjà commencé : vous ne pouvez plus modifier votre signalement.',
};

export type Evaluation = { ok: true } | { ok: false; refus: RefusAbsence };

/**
 * Le bénéficiaire peut-il encore signaler (ou annuler son signalement) pour
 * cette séance ? Oui si elle est 'planifiee' ET que l'instant présent est
 * STRICTEMENT avant son début. À l'instant exact du début : refusé — aucune
 * tolérance (décidé, même règle que evaluerReponse/cours-presence).
 *
 * Le serveur fait foi : `maintenant` doit toujours venir de `new Date()`
 * côté serveur, jamais d'une valeur envoyée par le client.
 */
export function evaluerAbsence(
  seance: { statut: unknown; date: unknown; heure_debut: unknown },
  maintenant: Date,
): Evaluation {
  if (seance.statut === 'realisee') return { ok: false, refus: 'seance_realisee' };
  if (seance.statut === 'annulee') return { ok: false, refus: 'seance_annulee' };
  if (seance.statut === 'reportee') return { ok: false, refus: 'seance_reportee' };
  if (seance.statut !== 'planifiee') return { ok: false, refus: 'seance_invalide' };

  const debut = instantDebutCours(seance.date, seance.heure_debut);
  if (!debut) return { ok: false, refus: 'seance_invalide' };

  return maintenant.getTime() < debut.getTime() ? { ok: true } : { ok: false, refus: 'deja_commencee' };
}
