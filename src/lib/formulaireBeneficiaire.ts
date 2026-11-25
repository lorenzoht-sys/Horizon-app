// Logique pure du formulaire bénéficiaire, partagée par le formulaire, la
// fiche et le PDF Dossier. Compte rendu de Pierre du 25/11/2026 : réorganiser
// sans migration, donc toutes les nouveautés vivent dans les jsonb existants
// (`anamnese`, `objectifs_patient`, `antecedents_structures`).

import type { AutonomieData } from '../types';

// ─── IMC ──────────────────────────────────────────────────────────────────────

export interface CategorieIMC {
  label: string;
  couleur: string;
}

/**
 * Seuils OMS. Avant le 25/11/2026, le formulaire et le PDF Dossier avaient
 * chacun leurs seuils (le PDF classait ≥ 40 en « Obésité sévère », le
 * formulaire en « Obésité morbide »). Les libellés « classe I/II/III »
 * remplacent « modérée / sévère / morbide » : même information clinique,
 * moins stigmatisante quand l'écran est tourné vers le bénéficiaire.
 */
export function categorieIMC(imc: number): CategorieIMC {
  if (imc < 18.5) return { label: 'Insuffisance pondérale', couleur: '#B45309' };
  if (imc < 25)   return { label: 'Corpulence normale',     couleur: '#3B6D11' };
  if (imc < 30)   return { label: 'Surpoids',               couleur: '#B45309' };
  if (imc < 35)   return { label: 'Obésité de classe I',    couleur: '#C2410C' };
  if (imc < 40)   return { label: 'Obésité de classe II',   couleur: '#B91C1C' };
  return           { label: 'Obésité de classe III',        couleur: '#991B1B' };
}

/** IMC arrondi au dixième, ou null si taille (cm) ou poids (kg) manquent. */
export function calculerIMC(tailleCm: number | null | undefined, poidsKg: number | null | undefined): number | null {
  const t = Number(tailleCm), p = Number(poidsKg);
  if (!(t > 0) || !(p > 0)) return null;
  return Math.round((p / ((t / 100) ** 2)) * 10) / 10;
}

// ─── Aides à la mobilité ──────────────────────────────────────────────────────

export const OPTIONS_AIDES_MOBILITE = [
  'Canne simple',
  'Canne tripode / quadripode',
  'Béquilles',
  'Déambulateur',
  'Rollator',
  'Fauteuil roulant manuel',
  'Fauteuil roulant électrique',
];

/** Anciennes valeurs du choix unique (`aideMarche`) → libellés actuels. */
const ANCIENNES_AIDES: Record<string, string> = { Canne: 'Canne simple' };

/**
 * Aides à la mobilité, classées de la plus utilisée à la moins utilisée.
 * Nouvelle clé `aidesMobilite` (liste) ; repli sur l'ancien choix unique
 * `aideMarche` pour les fiches saisies avant le 25/11/2026. « Aucune » et
 * « Autre » (ancien choix sans précision) ne sont pas des aides.
 */
export function aidesMobiliteDepuis(autonomie?: AutonomieData | null): string[] {
  if (Array.isArray(autonomie?.aidesMobilite)) return autonomie.aidesMobilite.filter(a => a.trim() !== '');
  const ancienne = autonomie?.aideMarche?.trim();
  if (!ancienne || ancienne === 'Aucune' || ancienne === 'Autre') return [];
  return [ANCIENNES_AIDES[ancienne] ?? ancienne];
}

/**
 * Valeur écrite dans `aideMarche` à côté de la liste : le PDF Dossier, les
 * anciennes versions de l'application encore ouvertes et toute lecture
 * existante continuent de lire un texte. « Aucune » quand le praticien a
 * explicitement indiqué l'absence d'aide.
 */
export function resumeAidesMobilite(aides: string[], aucune: boolean): string | null {
  if (aides.length > 0) return aides.join(', ');
  return aucune ? 'Aucune' : null;
}

// ─── Listes ordonnées ─────────────────────────────────────────────────────────

/** Déplace l'élément d'index `i` d'un cran vers le haut (-1) ou le bas (+1). */
export function deplacer<T>(liste: T[], i: number, sens: -1 | 1): T[] {
  const j = i + sens;
  if (i < 0 || i >= liste.length || j < 0 || j >= liste.length) return liste;
  const copie = [...liste];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
}

/** Retire l'émoji de tête d'un libellé d'option (« 💪 Renforcement » → « Renforcement »). */
export function sansEmoji(libelle: string): string {
  return libelle.replace(/^[^\p{L}\p{N}]+/u, '').trim() || libelle;
}
