// Reformulation des résultats de bilan pour l'affichage au bénéficiaire.
//
// Contexte : un bénéficiaire a vécu comme dévalorisant un résultat qualifié
// en termes cliniques bruts ("faible", "insuffisant"). Principe : remplacer un
// adjectif qui juge un état par une formulation qui pointe vers l'action et
// l'avenir, SANS changer le sens clinique — le score/la note brute reste
// inchangée en base et dans les vues praticien (TestsAutonomie.tsx,
// Step2_Physical.tsx, Step_ResultsIA.tsx, ParticipantProfile.tsx,
// FicheBilanPDF.tsx ne sont pas touchés).
//
// N'utiliser ces fonctions QUE dans les surfaces bénéficiaire :
// EspacePatient.tsx et FicheBilanBeneficiairePDF.tsx.
//
// Volontairement exclus de cette reformulation : bergRisque() (src/data/berg.ts)
// et tinettiRisque() (src/data/tinetti.ts). Pour ces deux échelles, "risque
// faible" est une BONNE nouvelle (peu de risque de chute) — un remplacement
// mécanique par ce dictionnaire inverserait le sens. Laissés intacts partout.

import type { NotesBilan } from '../types';

// ─── Notes 1-5 par catégorie (FicheBilanPDF / FicheBilanBeneficiairePDF) ─────

const CATEGORIE_LABEL: Record<keyof NotesBilan, string> = {
  equilibre: 'Équilibre',
  force: 'Force',
  handGrip: 'Force de préhension',
  mobilite: 'Mobilité',
  souplesse: 'Souplesse',
  endurance: 'Endurance',
  memoire: 'Mémoire',
};

// Reformulation uniquement pour les notes basses (1-2), seule zone à risque
// de dignité. 3 devient un libellé neutre orienté progression. 4-5 restent
// des libellés déjà positifs, volontairement peu remaniés.
const REFORMULATION_BASSE: Record<keyof NotesBilan, string> = {
  equilibre: 'Équilibre à consolider',
  force: 'Force à développer',
  handGrip: 'Force de préhension à développer',
  mobilite: 'Mobilité à retravailler',
  souplesse: 'Souplesse à développer',
  endurance: 'Endurance à développer',
  memoire: 'Mémoire à stimuler',
};

/** Libellé bienveillant pour une note 1-5 dans une catégorie donnée. */
export function libelleNoteBienveillant(categorie: keyof NotesBilan, note: 1 | 2 | 3 | 4 | 5): string {
  if (note <= 2) return REFORMULATION_BASSE[categorie];
  if (note === 3) return 'En progression';
  return note === 4 ? 'Bon niveau' : 'Excellent niveau';
}

export function libelleCategorieBilan(categorie: keyof NotesBilan): string {
  return CATEGORIE_LABEL[categorie];
}

// ─── Profils à seuils (sédentarité / fatigue — EspacePatient.tsx) ────────────

export function libelleSedentariteBeneficiaire(
  profil: 'inactif' | 'actif' | 'tres_actif',
): { label: string; emoji: string; color: string } {
  switch (profil) {
    case 'inactif':    return { label: 'Marge de progression', emoji: '🎯', color: '#BA7517' };
    case 'actif':       return { label: 'Modéré',               emoji: '🟡', color: '#BA7517' };
    case 'tres_actif':  return { label: 'Élevé',                 emoji: '🟢', color: '#0F6E56' };
  }
}

export function libelleFatigueBeneficiaire(
  profil: 'pas_de_fatigue' | 'fatigue_probable',
): { label: string; emoji: string; color: string } {
  // Déjà bienveillant dans le code existant — conservé tel quel pour
  // cohérence, exposé ici pour centraliser tous les libellés bénéficiaire
  // au même endroit.
  return profil === 'pas_de_fatigue'
    ? { label: 'Légère', emoji: '🟢', color: '#0F6E56' }
    : { label: 'À surveiller', emoji: '🔴', color: '#A32D2D' };
}

// ─── Effort perçu (Borg RPE — FicheBilanBeneficiairePDF) ─────────────────────

/** Variante bienveillante de borgRPEInterp() (FicheBilanPDF.tsx) : "faible" →
 *  "léger", nuance légère, sens clinique inchangé. */
export function libelleBorgBeneficiaire(v: number): string {
  if (v <= 11) return 'Effort léger';
  if (v <= 14) return 'Effort modéré';
  if (v <= 17) return 'Effort élevé';
  return 'Effort maximal';
}
