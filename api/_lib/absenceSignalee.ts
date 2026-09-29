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

// Alerte push au praticien (chantier « push praticien », lot E) : à la
// SIGNALISATION uniquement, jamais à la rétractation (décidé).
//
// Corps nominatif depuis le correctif « contenu et destination » : le
// message neutre fixe (« Un bénéficiaire… ») obligeait à ouvrir l'agenda
// pour savoir QUI était concerné. PRÉNOM SEUL, jamais le nom complet
// (décidé) : la notification s'affiche sur un écran verrouillé, le prénom
// reste utile au praticien sans identifier le bénéficiaire pour un tiers.
// Aucune donnée médicale, aucune date (la date est portée par l'URL
// ouverte au clic, voir urlNotificationAbsencePraticien).
const TITRE_NOTIFICATION_PRATICIEN = 'Horizon';

// Repli quand le prénom n'est pas exploitable (absent, vide) : l'ancien
// message neutre, inchangé.
export const MESSAGE_ABSENCE_SIGNALEE_PRATICIEN_NEUTRE = {
  titre: TITRE_NOTIFICATION_PRATICIEN,
  corps: 'Un bénéficiaire a signalé une absence pour sa prochaine séance.',
};

/** « 09:05 » ou « 09:05:00 » (colonne time Postgres) → « 9h05 ». null si illisible. */
function heureLisible(heureDebut: unknown): string | null {
  if (typeof heureDebut !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(heureDebut);
  return m ? `${Number(m[1])}h${m[2]}` : null;
}

/**
 * Message de l'alerte praticien. Avec prénom et heure : « Camille a signalé
 * son absence pour sa séance de 14h30 ». Sans heure exploitable (colonne
 * nullable) : « … pour sa prochaine séance ». Sans prénom exploitable :
 * repli neutre.
 */
export function messageAbsenceSignaleePraticien(
  seance: { prenom: unknown; heure_debut: unknown },
): { titre: string; corps: string } {
  const prenom = typeof seance.prenom === 'string' ? seance.prenom.trim() : '';
  if (!prenom) return { ...MESSAGE_ABSENCE_SIGNALEE_PRATICIEN_NEUTRE };
  const heure = heureLisible(seance.heure_debut);
  return {
    titre: TITRE_NOTIFICATION_PRATICIEN,
    corps: heure
      ? `${prenom} a signalé son absence pour sa séance de ${heure}`
      : `${prenom} a signalé son absence pour sa prochaine séance`,
  };
}

// Route ouverte au clic sur la notification (push-sw.js) : l'agenda mobile
// natif, positionné sur le jour de la séance (paramètre `date`, même format
// AAAA-MM-JJ que seances.date et que dateStr dans EcranAgenda — lu par
// ecranMobileDepuisUrl, src/lib/routesMobile.ts). Limite connue, inchangée :
// aucune route desktop « /agenda » distincte de /agenda-v2 ; sans
// information de type d'appareil sur l'abonnement, un seul choix sert tous
// les appareils du praticien.
export const URL_NOTIFICATION_ABSENCE_PRATICIEN = '/agenda';

/** `/agenda?date=AAAA-MM-JJ`, ou `/agenda` seul si la date est illisible. */
export function urlNotificationAbsencePraticien(date: unknown): string {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${URL_NOTIFICATION_ABSENCE_PRATICIEN}?date=${date}`
    : URL_NOTIFICATION_ABSENCE_PRATICIEN;
}

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
