// Cours collectifs : résolution des unités facturables, en mode individuel
// et en mode structure. Fonctions pures — le calcul du montant lui-même
// reste entièrement délégué à trouverTarifApplicable/totalFactureSeance
// (src/lib/tarifsContrats.ts) pour le mode individuel : aucune duplication
// de logique de tarif ici, uniquement la sélection des dates à facturer.

import type { CoursCollectif, ParticipationCoursCollectif, StatutPresenceCours } from '../types';

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

// ── Lecture côté fiche du bénéficiaire ──────────────────────────────────────

/** Un cours auquel un bénéficiaire est inscrit, avec SA participation. */
export interface EntreeCours {
  cours: CoursCollectif;
  participation: ParticipationCoursCollectif;
}

export type EtatCours = 'a_venir' | 'a_cloturer' | 'realise' | 'annule';

/**
 * Où en est le cours. « a_cloturer » : la date est passée mais le praticien ne
 * l'a jamais marqué « réalisé » — un cours oublié, à traiter, qui ne doit ni
 * passer pour à venir ni pour fait.
 * `aujourdhui` : AAAA-MM-JJ, passé par l'appelant pour rester une fonction pure.
 */
export function etatCours(cours: CoursCollectif, aujourdhui: string): EtatCours {
  if (cours.statut === 'annule') return 'annule';
  if (cours.statut === 'realise') return 'realise';
  return cours.date >= aujourdhui ? 'a_venir' : 'a_cloturer';
}

/**
 * Présence CONSTATÉE, ou null tant que le cours n'est pas réalisé.
 *
 * participations_cours_collectifs.statut_presence vaut « present » PAR DÉFAUT dès
 * l'inscription (creerCoursCollectif) : sur un cours à venir ou annulé, ce
 * « présent » n'a jamais été constaté par personne. Le montrer reviendrait à
 * afficher une présence qui n'a pas eu lieu.
 */
export function presenceConstatee(entree: EntreeCours): StatutPresenceCours | null {
  return entree.cours.statut === 'realise' ? entree.participation.statutPresence : null;
}

/**
 * Les cours d'un bénéficiaire, du plus récent au plus ancien. Une participation
 * dont le cours n'est pas (ou plus) visible est ignorée : la RLS peut masquer un
 * cours sans masquer la participation, et rien n'est alors à afficher.
 */
export function entreesCoursDuParticipant(
  cours: CoursCollectif[],
  participations: ParticipationCoursCollectif[],
  participantId: string,
): EntreeCours[] {
  const parId = new Map(cours.map(c => [c.id, c]));
  const entrees: EntreeCours[] = [];
  for (const p of participations) {
    if (p.participantId !== participantId) continue;
    const c = parId.get(p.coursId);
    if (c) entrees.push({ cours: c, participation: p });
  }
  return entrees.sort((a, b) =>
    b.cours.date.localeCompare(a.cours.date) || b.cours.heureDebut.localeCompare(a.cours.heureDebut),
  );
}

// ── Présence ANNONCÉE par les bénéficiaires (vue praticien) ─────────────────

export interface ResumeAnnonces {
  vient: number;
  neVientPas: number;
  /** Pas de réponse : ceux à relancer. */
  sansReponse: number;
  total: number;
}

/**
 * Où en sont les réponses « Je viens / Je ne viens pas » d'un cours. Trois états :
 * « vient », « ne vient pas », et « sans réponse » (undefined) — c'est ce dernier qui
 * permet au praticien de repérer les indécis avant la séance.
 */
export function resumeAnnonces(participations: Pick<ParticipationCoursCollectif, 'presenceAnnoncee'>[]): ResumeAnnonces {
  let vient = 0;
  let neVientPas = 0;
  for (const p of participations) {
    if (p.presenceAnnoncee === 'vient') vient++;
    else if (p.presenceAnnoncee === 'ne_vient_pas') neVientPas++;
  }
  return { vient, neVientPas, sansReponse: participations.length - vient - neVientPas, total: participations.length };
}

/** « 5 viennent · 1 ne vient pas · 2 sans réponse » — les zéros sont omis. */
export function libelleResumeAnnonces(r: ResumeAnnonces): string {
  const parts: string[] = [];
  if (r.vient > 0) parts.push(`${r.vient} ${r.vient > 1 ? 'viennent' : 'vient'}`);
  if (r.neVientPas > 0) parts.push(`${r.neVientPas} ${r.neVientPas > 1 ? 'ne viennent pas' : 'ne vient pas'}`);
  if (r.sansReponse > 0) parts.push(`${r.sansReponse} sans réponse`);
  return parts.join(' · ');
}

/** Forme compacte pour une étiquette de calendrier : « ✓5 ✗1 ?2 » (les zéros sont omis). */
export function libelleCompactAnnonces(r: ResumeAnnonces): string {
  const parts: string[] = [];
  if (r.vient > 0) parts.push(`✓${r.vient}`);
  if (r.neVientPas > 0) parts.push(`✗${r.neVientPas}`);
  if (r.sansReponse > 0) parts.push(`?${r.sansReponse}`);
  return parts.join(' ');
}

// ── Synthèse d'assiduité (dossier PDF) ──────────────────────────────────────

export interface SyntheseCours {
  realises: number;
  presents: number;
  absents: number;
  excuses: number;
}

/**
 * Assiduité sur les cours RÉALISÉS, et eux seuls : un cours à venir ou annulé n'a aucune
 * présence constatée (statut_presence vaut « present » par défaut dès l'inscription), il ne
 * doit ni gonfler ni diluer le décompte.
 */
export function syntheseCoursRealises(entrees: EntreeCours[]): SyntheseCours {
  const s: SyntheseCours = { realises: 0, presents: 0, absents: 0, excuses: 0 };
  for (const e of entrees) {
    const presence = presenceConstatee(e); // null tant que le cours n'est pas réalisé
    if (presence === null) continue;
    s.realises++;
    if (presence === 'present') s.presents++;
    else if (presence === 'absent') s.absents++;
    else s.excuses++;
  }
  return s;
}

/** « Présent à 8 cours sur 10 réalisés · 1 absence · 1 excusé » — vide s'il n'y a aucun cours réalisé. */
export function libelleSyntheseCours(s: SyntheseCours): string {
  if (s.realises === 0) return '';
  const parts = [`Présent à ${s.presents} cours sur ${s.realises} réalisé${s.realises > 1 ? 's' : ''}`];
  if (s.absents > 0) parts.push(`${s.absents} absence${s.absents > 1 ? 's' : ''}`);
  if (s.excuses > 0) parts.push(`${s.excuses} excusé${s.excuses > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
