// Scores des tests d'auto-évaluation : Ricci & Gagnon (activité physique) et
// FSS (fatigue). Logique pure, séparée du rendu (TestsAutonomie.tsx) pour être
// testable — vitest.config.ts n'inclut que src/lib et src/utils, en
// environnement `node`.
//
// ── Règle centrale : une absence de réponse n'est pas une réponse ──────────
//
// Les deux calculs traitaient un item non répondu comme un zéro (Ricci &
// Gagnon : `r.a_sedentarite ?? 0`) ou l'ignoraient purement et simplement
// (FSS : somme des seuls items répondus, comparée au seuil fixe de 36). Dans
// les deux cas le total était ensuite confronté à des seuils calibrés pour un
// questionnaire COMPLET, et le résultat sortait sans le moindre signe
// d'incomplétude.
//
// Signalé par Pierre le 2026-09-13 comme une inversion de pondération : une
// personne assise moins de 2 h/jour obtenait un score plus mauvais qu'une
// personne assise plus de 5 h. Le diagnostic du 2026-09-14 a écarté
// l'inversion — la pondération est juste, et n'est pas modifiée ici — et
// désigné l'incomplétude :
//
//   assis « Moins de 2h », rien d'autre de rempli    → 5   « Inactif »
//   assis « + de 5h », le reste rempli au minimum    → 6   « Inactif »
//
// Le questionnaire partiellement rempli perd contre le questionnaire complet,
// quel que soit le contenu des réponses. Côté FSS le biais va dans l'autre
// sens et rassure à tort : une personne répondant 7 à cinq items sur neuf
// totalise 35, donc « Pas de fatigue significative ».
//
// Décision du 2026-09-14 : un questionnaire incomplet ne produit AUCUN score.
// Les fonctions de calcul renvoient `null`, et l'appelant affiche les items
// manquants (`itemsSedManquants` / `itemsFSSManquants`) plutôt qu'un chiffre.

import type { SedentariteReponses } from '../types';

// ─── Pondération ──────────────────────────────────────────────────────────
// Barème Ricci & Gagnon, INCHANGÉ : le diagnostic du 2026-09-14 l'a confirmé
// correct, réponse par réponse. Ne pas y toucher sans source clinique citée.

export const SED_ASSIS = [
  { label: '+ de 5h', score: 1 }, { label: '4 à 5h', score: 2 }, { label: '3 à 4h', score: 3 },
  { label: '2 à 3h', score: 4 }, { label: 'Moins de 2h', score: 5 },
];
export const SED_FREQ = [
  { label: '1-2x/mois', score: 1 }, { label: '1x/sem', score: 2 }, { label: '2x/sem', score: 3 },
  { label: '3x/sem', score: 4 }, { label: '4x/sem+', score: 5 },
];
export const SED_DUREE = [
  { label: '< 15 min', score: 1 }, { label: '16-30 min', score: 2 }, { label: '31-45 min', score: 3 },
  { label: '46-60 min', score: 4 }, { label: '+ 60 min', score: 5 },
];
export const SED_EFFORT = [
  { label: 'Très facile', score: 1 }, { label: 'Facile', score: 2 }, { label: 'Modéré', score: 3 },
  { label: 'Difficile', score: 4 }, { label: 'Très difficile', score: 5 },
];
export const SED_INTENSITE = [
  { label: 'Légère', score: 1 }, { label: 'Modérée', score: 2 }, { label: 'Moyenne', score: 3 },
  { label: 'Intense', score: 4 }, { label: 'Très intense', score: 5 },
];
export const SED_TRAVAUX = [
  { label: '< 2h', score: 1 }, { label: '3-4h', score: 2 }, { label: '5-6h', score: 3 },
  { label: '7-9h', score: 4 }, { label: '10h+', score: 5 },
];
// Question « minutes par jour de marche » : mêmes tranches et mêmes points que
// SED_DUREE, mais SED_DUREE décrit la durée d'UNE séance de loisir. Réutiliser
// le tableau laissait deux questions de sens différent partager des libellés
// identiques — on lisait « < 15 min » sans savoir si c'était par séance ou par
// jour. Tableau distinct, libellés suffixés « /j » : la pondération est
// inchangée, seule l'unité est désormais dite.
export const SED_MARCHE = [
  { label: '< 15 min/j', score: 1 }, { label: '16-30 min/j', score: 2 }, { label: '31-45 min/j', score: 3 },
  { label: '46-60 min/j', score: 4 }, { label: '+ 60 min/j', score: 5 },
];
export const SED_ETAGES = [
  { label: '< 2', score: 1 }, { label: '3-5', score: 2 }, { label: '6-10', score: 3 },
  { label: '11-15', score: 4 }, { label: '16+', score: 5 },
];

export const EMPTY_SED: SedentariteReponses = {
  a_sedentarite: null, b_pratique: null, b_freq: null, b_duree: null, b_effort: null,
  c_intensite: null, c_travaux: null, c_marche: null, c_etages: null,
};

// Maximum réellement atteignable : A=5, B=5+5+5+5=20, C=5×4=20.
// L'interface affichait « / 55 », un dénominateur qui ne correspondait à rien
// et faisait paraître tout score plus faible qu'il n'était.
export const SED_TOTAL_MAX = 45;

/** 9 items à 7 points. */
export const FSS_TOTAL_MAX = 63;
export const FSS_NB_ITEMS = 9;
/** Seuil de fatigue probable — 4 par item en moyenne, sur 9 items. */
export const FSS_SEUIL = 36;

export type ItemSedentarite = keyof SedentariteReponses;

export const LIBELLES_ITEMS_SED: Record<ItemSedentarite, string> = {
  a_sedentarite: 'Temps passé en position assise',
  b_pratique: "Pratique d'une activité physique",
  b_freq: 'Fréquence de pratique',
  b_duree: 'Durée moyenne des séances',
  b_effort: 'Effort perçu',
  c_intensite: 'Intensité physique du travail',
  c_travaux: 'Heures de travaux légers',
  c_marche: 'Minutes de marche par jour',
  c_etages: 'Étages montés par jour',
};

export const FSS_QUESTIONS = [
  'Je suis moins motivé(e) quand je suis fatigué(e)',
  "L'exercice physique me rend fatigué(e)",
  'Je suis facilement fatigué(e)',
  'La fatigue gêne mon fonctionnement physique',
  'La fatigue me cause fréquemment des problèmes',
  "La fatigue m'empêche d'avoir une activité physique soutenue",
  "La fatigue m'empêche d'accomplir mes responsabilités",
  'La fatigue est parmi mes 3 symptômes les plus invalidants',
  'La fatigue interfère avec ma vie professionnelle/familiale/sociale',
];

// ─── Complétude ───────────────────────────────────────────────────────────

/**
 * Items exigés pour ce jeu de réponses.
 *
 * La fréquence, la durée et l'effort ne sont posés qu'aux personnes qui
 * déclarent pratiquer une activité physique : l'interface les masque quand
 * `b_pratique` vaut 'non'. Les exiger dans ce cas rendrait tout questionnaire
 * de non-pratiquant définitivement incomplet.
 */
export function itemsSedRequis(r: SedentariteReponses): ItemSedentarite[] {
  const requis: ItemSedentarite[] = ['a_sedentarite', 'b_pratique'];
  if (r.b_pratique === 'oui') requis.push('b_freq', 'b_duree', 'b_effort');
  requis.push('c_intensite', 'c_travaux', 'c_marche', 'c_etages');
  return requis;
}

/** Items requis restés vides. Vide ⇒ questionnaire complet. */
export function itemsSedManquants(r: SedentariteReponses): ItemSedentarite[] {
  // `b_pratique` non répondu : on ne sait pas encore si la branche loisir
  // s'applique. On ne signale alors que ce qui est certain, pour ne pas
  // afficher des items qui pourraient ne jamais être posés.
  return itemsSedRequis(r).filter(item => r[item] === null || r[item] === undefined);
}

/** Indices (0-8) des affirmations FSS restées sans réponse. */
export function itemsFSSManquants(reponses: (number | null)[] | null | undefined): number[] {
  const rep = reponses ?? [];
  const manquants: number[] = [];
  for (let i = 0; i < FSS_NB_ITEMS; i++) {
    if (rep[i] === null || rep[i] === undefined) manquants.push(i);
  }
  return manquants;
}

// ─── Calcul ───────────────────────────────────────────────────────────────

/**
 * Score Ricci & Gagnon, ou `null` si un item requis manque.
 *
 * Ne renvoie plus de total partiel : un questionnaire incomplet ne produit
 * aucun score (décision du 2026-09-14).
 */
export function computeSedScore(
  r: SedentariteReponses | null | undefined,
): { scoreA: number; scoreB: number; scoreC: number; total: number } | null {
  if (!r) return null;
  if (itemsSedManquants(r).length > 0) return null;

  const scoreA = r.a_sedentarite as number;
  const scoreB =
    r.b_pratique === 'non'
      ? 1
      : 5 + (r.b_freq as number) + (r.b_duree as number) + (r.b_effort as number);
  const scoreC =
    (r.c_intensite as number) + (r.c_travaux as number) + (r.c_marche as number) + (r.c_etages as number);

  return { scoreA, scoreB, scoreC, total: scoreA + scoreB + scoreC };
}

/**
 * Score FSS, ou `null` si une des 9 affirmations est sans réponse.
 *
 * La somme des seuls items répondus n'est pas comparable au seuil de 36, qui
 * suppose les 9 items : elle ne peut que sous-estimer la fatigue.
 */
export function computeFSSScore(reponses: (number | null)[] | null | undefined): number | null {
  if (!reponses) return null;
  if (itemsFSSManquants(reponses).length > 0) return null;
  return reponses.slice(0, FSS_NB_ITEMS).reduce<number>((somme, v) => somme + (v as number), 0);
}

// ─── Interprétation ───────────────────────────────────────────────────────

export function getSedProfil(score: number) {
  if (score < 18) return {
    profil: 'inactif' as const,
    label: 'Inactif',
    color: '#E24B4A',
    bg: '#FCEBEB',
    description: "Niveau d'activité insuffisant — priorité à la mise en mouvement progressive",
  };
  if (score <= 35) return {
    profil: 'actif' as const,
    label: 'Actif',
    color: '#BA7517',
    bg: '#FAEEDA',
    description: "Niveau d'activité modéré — maintenir et progresser",
  };
  return {
    profil: 'tres_actif' as const,
    label: 'Très actif',
    color: '#0F6E56',
    bg: '#E1F5EE',
    description: "Excellent niveau d'activité — adapter l'intensité au profil pathologique",
  };
}

export function getFSSProfil(score: number) {
  if (score < FSS_SEUIL) return {
    profil: 'pas_de_fatigue' as const,
    label: 'Pas de fatigue significative',
    color: '#0F6E56',
    bg: '#E1F5EE',
    description: "Score FSS < 36 — la fatigue n'est probablement pas un facteur limitant majeur",
  };
  return {
    profil: 'fatigue_probable' as const,
    label: 'Fatigue probable',
    color: '#A32D2D',
    bg: '#FCEBEB',
    description: "Score FSS ≥ 36 — adapter l'intensité des séances, surveiller la récupération. Informer le médecin.",
  };
}

// ─── État « à régulariser » ───────────────────────────────────────────────

export type EtatQuestionnaire =
  | { etat: 'vide' }
  | { etat: 'a_regulariser'; manquants: string[] }
  | { etat: 'complet'; score: number };

/**
 * État d'affichage d'un questionnaire Ricci & Gagnon.
 *
 * Distingue « pas commencé » de « commencé puis laissé incomplet » : le
 * premier n'appelle aucune action, le second est un bilan à reprendre.
 */
export function etatSedentarite(r: SedentariteReponses | null | undefined): EtatQuestionnaire {
  if (!r) return { etat: 'vide' };
  const manquants = itemsSedManquants(r);
  const requis = itemsSedRequis(r);
  if (manquants.length === requis.length) return { etat: 'vide' };
  if (manquants.length > 0) {
    return { etat: 'a_regulariser', manquants: manquants.map(i => LIBELLES_ITEMS_SED[i]) };
  }
  return { etat: 'complet', score: computeSedScore(r)!.total };
}

/** Même logique pour la FSS, les manquants étant désignés par leur numéro. */
export function etatFatigue(reponses: (number | null)[] | null | undefined): EtatQuestionnaire {
  if (!reponses || reponses.length === 0) return { etat: 'vide' };
  const manquants = itemsFSSManquants(reponses);
  if (manquants.length === FSS_NB_ITEMS) return { etat: 'vide' };
  if (manquants.length > 0) {
    return { etat: 'a_regulariser', manquants: manquants.map(i => `Affirmation ${i + 1} — ${FSS_QUESTIONS[i]}`) };
  }
  return { etat: 'complet', score: computeFSSScore(reponses)! };
}
