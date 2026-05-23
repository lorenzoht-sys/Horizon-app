import type { IndisponibilitePierre } from '../types';

// Indisponibilités de démonstration pour Pierre
// Elles sont chargées automatiquement si aucune indispo n'existe dans localStorage

export const DEMO_INDISPOS_PIERRE: IndisponibilitePierre[] = [
  // ── Déjeuner quotidien (lun → ven) ──────────────────────────────
  {
    id: 'indispo-dejeuner-lun',
    jour: 'lun', heureDebut: '12:00', heureFin: '13:30',
    recurrente: true, label: 'Déjeuner',
  },
  {
    id: 'indispo-dejeuner-mar',
    jour: 'mar', heureDebut: '12:00', heureFin: '13:30',
    recurrente: true, label: 'Déjeuner',
  },
  {
    id: 'indispo-dejeuner-mer',
    jour: 'mer', heureDebut: '12:00', heureFin: '13:30',
    recurrente: true, label: 'Déjeuner',
  },
  {
    id: 'indispo-dejeuner-jeu',
    jour: 'jeu', heureDebut: '12:00', heureFin: '13:30',
    recurrente: true, label: 'Déjeuner',
  },
  {
    id: 'indispo-dejeuner-ven',
    jour: 'ven', heureDebut: '12:00', heureFin: '14:00',
    recurrente: true, label: 'Déjeuner + admin',
  },

  // ── Mardi soir — Formation mensuelle APA ─────────────────────────
  {
    id: 'indispo-formation-mar',
    jour: 'mar', heureDebut: '17:30', heureFin: '19:30',
    recurrente: true, label: 'Formation APA',
  },

  // ── Jeudi — Réunion réseau de santé ──────────────────────────────
  {
    id: 'indispo-reunion-jeu',
    jour: 'jeu', heureDebut: '15:00', heureFin: '16:30',
    recurrente: true, label: 'Réunion réseau santé',
  },

  // ── Lundi soir — Temps personnel ─────────────────────────────────
  {
    id: 'indispo-perso-lun',
    jour: 'lun', heureDebut: '18:00', heureFin: '20:00',
    recurrente: true, label: 'Temps personnel',
  },
];
