import type { Seance } from '../types';

/**
 * Choix de la séance mise en avant sur l'accueil mobile, et liste des séances passées restées
 * « planifiées ».
 *
 * Avant le 23/11/2026, la carte passait au rendez-vous suivant dès l'heure de début dépassée :
 * Pierre, en retard ou encore chez Mme A à 15 h 05, voyait déjà M. B et perdait l'accès direct
 * à la personne qu'il allait voir. Désormais une séance non clôturée reste en avant jusqu'à une
 * heure après sa fin prévue, ou jusqu'à ce qu'elle soit validée, annulée ou passée à la main.
 * Au-delà, elle bascule dans le rappel « à confirmer » : une séance oubliée ne bloque jamais
 * l'accueil, et ne disparaît pas non plus sans avoir été confirmée (sinon elle n'entre pas dans
 * la facture du mois).
 */

/** Délai après la fin prévue pendant lequel une séance non clôturée reste en avant. */
export const DELAI_GARDE_MINUTES = 60;

/** Fenêtre du rappel : au-delà, le contrôle de la facturation du mois prend le relais. */
export const FENETRE_RAPPEL_JOURS = 60;

function enMinutes(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + (m || 0);
}

function encoreEnAvant(s: Seance, maintenant: string): boolean {
  return enMinutes(s.heureFin) + DELAI_GARDE_MINUTES > enMinutes(maintenant);
}

/**
 * Séance à afficher en grand : la première séance planifiée du jour qui n'est ni écartée à la
 * main ni terminée depuis plus d'une heure. `null` s'il n'y en a plus.
 */
export function seancePrincipale(
  seancesDuJour: Seance[],
  maintenant: string,
  ecartees: ReadonlySet<string> = new Set(),
): Seance | null {
  return [...seancesDuJour]
    .filter(s => s.statut === 'planifiee' && !ecartees.has(s.id) && encoreEnAvant(s, maintenant))
    .sort((a, b) => enMinutes(a.heureDebut) - enMinutes(b.heureDebut))[0] ?? null;
}

/**
 * Séances passées toujours « planifiées » : jours précédents (dans la fenêtre) et séances du
 * jour terminées depuis plus d'une heure. Les plus récentes d'abord.
 */
export function seancesAConfirmer(seances: Seance[], aujourdhui: string, maintenant: string): Seance[] {
  const debut = new Date(`${aujourdhui}T12:00:00`);
  debut.setDate(debut.getDate() - FENETRE_RAPPEL_JOURS);
  const dateMin = debut.toISOString().slice(0, 10);
  return seances
    .filter(s => s.statut === 'planifiee' && (
      (s.date < aujourdhui && s.date >= dateMin) ||
      (s.date === aujourdhui && !encoreEnAvant(s, maintenant))
    ))
    .sort((a, b) => b.date.localeCompare(a.date) || enMinutes(b.heureDebut) - enMinutes(a.heureDebut));
}
