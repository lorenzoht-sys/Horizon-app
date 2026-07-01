import type { BergData, BergScore } from '../types';

export interface BergItemDef {
  index: number;
  label: string;
  options: { v: BergScore; label: string }[];
}

export const BERG_ITEMS: BergItemDef[] = [
  {
    index: 0, label: '1. Assis → Debout',
    options: [
      { v: 0, label: 'Aide importante nécessaire' },
      { v: 1, label: 'Aide légère ou surveillance' },
      { v: 2, label: 'Plusieurs essais, aide des mains' },
      { v: 3, label: 'Aide des mains, 1er essai' },
      { v: 4, label: 'Sans aide des mains, stable' },
    ],
  },
  {
    index: 1, label: '2. Debout sans appui (2 min)',
    options: [
      { v: 0, label: 'Impossible sans soutien' },
      { v: 1, label: '30 s avec surveillance' },
      { v: 2, label: '30 s indépendant' },
      { v: 3, label: '2 min avec surveillance' },
      { v: 4, label: '2 min stable et sûr' },
    ],
  },
  {
    index: 2, label: '3. Assis sans appui (2 min)',
    options: [
      { v: 0, label: 'Impossible 10 s sans appui' },
      { v: 1, label: '10 s' },
      { v: 2, label: '30 s' },
      { v: 3, label: '2 min avec surveillance' },
      { v: 4, label: '2 min stable et sûr' },
    ],
  },
  {
    index: 3, label: '4. Debout → Assis',
    options: [
      { v: 0, label: 'Aide pour s\'asseoir' },
      { v: 1, label: 'Assise non contrôlée' },
      { v: 2, label: 'Utilise l\'arrière des jambes' },
      { v: 3, label: 'Contrôle à l\'aide des mains' },
      { v: 4, label: 'Aide minimale des mains, sûr' },
    ],
  },
  {
    index: 4, label: '5. Transferts',
    options: [
      { v: 0, label: '2 personnes nécessaires' },
      { v: 1, label: '1 personne nécessaire' },
      { v: 2, label: 'Guidage verbal ou surveillance' },
      { v: 3, label: 'Légère aide des mains' },
      { v: 4, label: 'Aide minimale des mains, sûr' },
    ],
  },
  {
    index: 5, label: '6. Debout, yeux fermés (10 s)',
    options: [
      { v: 0, label: 'Aide pour ne pas tomber' },
      { v: 1, label: 'Incapable 3 s mais reste debout' },
      { v: 2, label: '3 s' },
      { v: 3, label: '10 s avec surveillance' },
      { v: 4, label: '10 s en toute sécurité' },
    ],
  },
  {
    index: 6, label: '7. Pieds joints, debout (1 min)',
    options: [
      { v: 0, label: 'Position aidée, incapable 15 s' },
      { v: 1, label: 'Position aidée, tient 15 s' },
      { v: 2, label: 'Pieds joints, 30 s indépendant' },
      { v: 3, label: 'Pieds joints, 1 min surveillé' },
      { v: 4, label: 'Pieds joints, 1 min sûr' },
    ],
  },
  {
    index: 7, label: '8. Bras tendu en avant',
    options: [
      { v: 0, label: 'Perd l\'équilibre en essayant' },
      { v: 1, label: 'Atteint avec surveillance' },
      { v: 2, label: 'Atteint > 5 cm' },
      { v: 3, label: 'Atteint > 12 cm' },
      { v: 4, label: 'Atteint > 25 cm, en sécurité' },
    ],
  },
  {
    index: 8, label: '9. Ramasser objet au sol',
    options: [
      { v: 0, label: 'Aide / impossible d\'essayer' },
      { v: 1, label: 'Essaie, surveillance requise' },
      { v: 2, label: 'À 2-5 cm, équilibre maintenu' },
      { v: 3, label: 'Ramasse avec surveillance' },
      { v: 4, label: 'Ramasse facilement, en sécurité' },
    ],
  },
  {
    index: 9, label: '10. Regarder derrière les épaules',
    options: [
      { v: 0, label: 'Aide pour l\'équilibre' },
      { v: 1, label: 'Surveillance requise' },
      { v: 2, label: 'Rotation latérale seulement' },
      { v: 3, label: 'Regarde d\'un côté seulement' },
      { v: 4, label: 'Des deux côtés, bon équilibre' },
    ],
  },
  {
    index: 10, label: '11. Pivoter 360°',
    options: [
      { v: 0, label: 'Aide pendant le pivot' },
      { v: 1, label: 'Guidage verbal requis' },
      { v: 2, label: 'Lent mais sûr' },
      { v: 3, label: '≤ 4 s d\'un côté seulement' },
      { v: 4, label: '≤ 4 s des deux côtés' },
    ],
  },
  {
    index: 11, label: '12. Pied sur tabouret (4×, 20 s)',
    options: [
      { v: 0, label: 'Aide pour ne pas tomber' },
      { v: 1, label: 'Aide mineure, 2 fois' },
      { v: 2, label: '2 fois sans aide, surveillé' },
      { v: 3, label: '4 fois indépendant, > 20 s' },
      { v: 4, label: '4 fois en ≤ 20 s, sûr' },
    ],
  },
  {
    index: 12, label: '13. Pieds en tandem (30 s)',
    options: [
      { v: 0, label: 'Perd l\'équilibre' },
      { v: 1, label: 'Position aidée, tient 15 s' },
      { v: 2, label: 'Petit pas en avant, 30 s' },
      { v: 3, label: 'Pied en avant de l\'autre, 30 s' },
      { v: 4, label: 'Tandem indépendant, 30 s' },
    ],
  },
  {
    index: 13, label: '14. Maintien unipodal (10 s)',
    options: [
      { v: 0, label: 'Impossible, aide nécessaire' },
      { v: 1, label: 'Essaie, tient < 3 s' },
      { v: 2, label: 'Tient 3-4 s' },
      { v: 3, label: 'Tient 5-10 s' },
      { v: 4, label: 'Tient > 10 s, indépendant' },
    ],
  },
];

export function emptyBergData(): BergData {
  return { items: Array(14).fill(null) };
}

export function computeBergScore(berg: BergData | null | undefined): number | null {
  if (!berg) return null;
  const filled = berg.items.filter((v): v is BergScore => v !== null);
  if (filled.length === 0) return null;
  return filled.reduce((s, v) => s + v, 0 as number);
}

export type BergRisque = 'faible' | 'modere' | 'eleve';

export function bergRisque(score: number | null): BergRisque | null {
  if (score === null) return null;
  if (score >= 49) return 'faible';
  if (score >= 45) return 'modere';
  return 'eleve';
}
