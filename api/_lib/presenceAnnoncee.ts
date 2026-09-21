// Présence ANNONCÉE par le bénéficiaire avant un cours collectif (« Je viens » /
// « Je ne viens pas ») : validation de la demande et règle « jusqu'au début du
// cours ». Fonctions pures, testées ; la route est dans api/patient/activite.ts.
//
// Distincte de la présence CONSTATÉE (participations_cours_collectifs.statut_presence,
// saisie par le praticien le jour du cours) : les deux champs ne se remplacent pas.
//
// Trois états en base : 'vient', 'ne_vient_pas', et NULL = PAS DE RÉPONSE. Le
// bénéficiaire ne peut pas revenir à NULL : il change d'avis, il n'efface pas.

import { dateHeureParisVersUTC } from './rappels.js';

export const REPONSES_PRESENCE = ['vient', 'ne_vient_pas'] as const;
export type ReponsePresence = (typeof REPONSES_PRESENCE)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Valeur lue en base ou reçue : la réponse si elle est valide, sinon null (= pas de réponse). */
export function reponseValide(v: unknown): ReponsePresence | null {
  return typeof v === 'string' && (REPONSES_PRESENCE as readonly string[]).includes(v) ? (v as ReponsePresence) : null;
}

export type CorpsCoursPresence =
  | { ok: true; coursId: string; reponse: ReponsePresence }
  | { ok: false; erreur: string };

/**
 * Valide le corps AVANT toute requête : un identifiant qui n'est pas un UUID ne
 * doit jamais partir vers PostgREST (l'erreur qui en reviendrait dirait des choses
 * sur le schéma). Le participant n'est PAS dans le corps : il vient du jeton.
 */
export function validerCorpsCoursPresence(body: unknown): CorpsCoursPresence {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.coursId !== 'string' || !UUID.test(b.coursId)) {
    return { ok: false, erreur: 'coursId invalide' };
  }
  const reponse = reponseValide(b.reponse);
  if (!reponse) {
    return { ok: false, erreur: 'reponse invalide : "vient" ou "ne_vient_pas"' };
  }
  return { ok: true, coursId: b.coursId, reponse };
}

/**
 * Instant de début du cours (date + heure civiles Europe/Paris, CET/CEST gérés),
 * ou null si la date est inexploitable.
 *
 * `heure_debut` est un texte libre côté base. dateHeureParisVersUTC LÈVE une
 * RangeError sur une heure malformée au lieu de renvoyer une date invalide (mesuré) :
 * sans ce garde, une seule ligne mal saisie ferait crasher la route en 500. Heure
 * inexploitable → la réponse reste ouverte JUSQU'À 23h59 de ce jour-là, plutôt que
 * de bloquer le bénéficiaire pour une anomalie de données.
 */
export function instantDebutCours(date: unknown, heureDebut: unknown): Date | null {
  if (typeof date !== 'string' || !DATE_ISO.test(date)) return null;
  const heure = typeof heureDebut === 'string' && HEURE.test(heureDebut) ? heureDebut : '23:59';
  const instant = dateHeureParisVersUTC(date, heure);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export type RefusReponse = 'cours_annule' | 'cours_realise' | 'deja_commence' | 'cours_invalide';

export const MESSAGES_REFUS: Record<RefusReponse, string> = {
  cours_annule: 'Ce cours est annulé.',
  cours_realise: 'Ce cours a déjà eu lieu.',
  deja_commence: 'Ce cours a déjà commencé : vous ne pouvez plus modifier votre réponse.',
  cours_invalide: 'Ce cours ne peut pas recevoir de réponse.',
};

export type Evaluation = { ok: true } | { ok: false; refus: RefusReponse };

/**
 * Le bénéficiaire peut-il encore répondre ? Oui si le cours est planifié ET que
 * l'instant présent est STRICTEMENT avant son début. À l'instant exact du début :
 * refusé — aucune tolérance (décidé).
 *
 * Le serveur fait foi : l'interface masque les boutons, mais rien de ce que le
 * navigateur affiche ne dispense de ce contrôle.
 */
export function evaluerReponse(
  cours: { statut: unknown; date: unknown; heure_debut: unknown },
  maintenant: Date,
): Evaluation {
  if (cours.statut === 'annule') return { ok: false, refus: 'cours_annule' };
  if (cours.statut === 'realise') return { ok: false, refus: 'cours_realise' };
  if (cours.statut !== 'planifie') return { ok: false, refus: 'cours_invalide' };

  const debut = instantDebutCours(cours.date, cours.heure_debut);
  if (!debut) return { ok: false, refus: 'cours_invalide' };

  return maintenant.getTime() < debut.getTime() ? { ok: true } : { ok: false, refus: 'deja_commence' };
}

/**
 * Le bénéficiaire voit-il ses rendez-vous ? Même règle EXACTE que api/patient/me.ts
 * (`{ ...VISIBILITE_DEFAULT, ...brut }` puis `visibilite.rdv`) : défaut « visible »,
 * masqué dès que la valeur portée est fausse — y compris null. S'il ne voit pas ses
 * cours, il ne peut pas non plus y répondre.
 */
export function rendezVousVisibles(visibiliteBeneficiaire: unknown): boolean {
  const brut = (visibiliteBeneficiaire && typeof visibiliteBeneficiaire === 'object' ? visibiliteBeneficiaire : {}) as Record<string, unknown>;
  return Boolean({ rdv: true, ...brut }.rdv);
}
