import type { Contrat } from '../types';

// Aujourd'hui = 20 mai 2026
// Contrats variés : actif · terminé · suspendu · alerte renouvellement

export const DEMO_CONTRATS: Contrat[] = [

  // ── 1. Martine Leroy — 3×/semaine (T4) ──────────────────────────
  {
    id: 'contrat-demo-1',
    participantId: 'demo-1',
    dateDebut: '2026-04-01',
    dateFin: '2026-06-30',
    joursFixe: ['lun', 'mer', 'ven'],
    heureDebut: '09:00',
    dureeMinutes: 45,
    statut: 'actif',
    notes: 'T4 — consolidation équilibre, marche nordique. FC max 130 (diabète). Glycémie à surveiller.',
    dateCreation: '2026-03-28',
    nombreSeancesTotal: 39,
    nombreSeancesRealisees: 20,
  },

  // ── 2. Jean-Pierre Moreau — prescription 20 séances post-PTG ⚠️ EXPIRE BIENTÔT ──
  {
    id: 'contrat-demo-2',
    participantId: 'demo-2',
    dateDebut: '2026-03-03',
    dateFin: '2026-05-28',
    joursFixe: ['mar', 'jeu'],
    heureDebut: '14:00',
    dureeMinutes: 60,
    statut: 'actif',
    notes: 'Dr Lemaire — 20 séances APA prescrites post-PTG genou D. Kiné en parallèle le matin.',
    dateCreation: '2026-03-01',
    nombreSeancesTotal: 20,
    nombreSeancesRealisees: 16,
  },

  // ── 3. Sophie Blanchard — rééducation LCA, 1×/semaine ────────────
  {
    id: 'contrat-demo-3',
    participantId: 'demo-3',
    dateDebut: '2026-04-01',
    dateFin: '2026-06-30',
    joursFixe: ['mar'],
    heureDebut: '18:30',
    dureeMinutes: 45,
    statut: 'actif',
    notes: 'Rééducation LCA genou D — objectif reprise foot septembre 2026. Travaille en journée.',
    dateCreation: '2026-03-30',
    nombreSeancesTotal: 13,
    nombreSeancesRealisees: 6,
  },

  // ── 4a. Robert Girard — T1 post-PTH TERMINÉ ✅ ───────────────────
  {
    id: 'contrat-demo-4a',
    participantId: 'demo-4',
    dateDebut: '2026-01-05',
    dateFin: '2026-03-31',
    joursFixe: ['lun', 'jeu'],
    heureDebut: '09:00',
    dureeMinutes: 60,
    statut: 'termine',
    notes: 'Dr Faure — 24 séances post-PTH D. Prescription terminée avec succès. Marche sans aide ✓',
    dateCreation: '2026-01-04',
    nombreSeancesTotal: 24,
    nombreSeancesRealisees: 24,
  },

  // ── 4b. Robert Girard — T2 consolidation ACTIF ───────────────────
  {
    id: 'contrat-demo-4',
    participantId: 'demo-4',
    dateDebut: '2026-04-07',
    dateFin: '2026-06-30',
    joursFixe: ['lun', 'jeu'],
    heureDebut: '10:45',
    dureeMinutes: 60,
    statut: 'actif',
    notes: 'Phase consolidation post-PTH — maintien des acquis, renforcement fonctionnel.',
    dateCreation: '2026-04-05',
    nombreSeancesTotal: 24,
    nombreSeancesRealisees: 12,
  },

  // ── 5. Isabelle Mercier — insuffisance cardiaque, 2×/semaine ─────
  {
    id: 'contrat-demo-5',
    participantId: 'demo-5',
    dateDebut: '2026-04-01',
    dateFin: '2026-06-30',
    joursFixe: ['mer', 'sam'],
    heureDebut: '09:30',
    dureeMinutes: 45,
    statut: 'actif',
    notes: 'Insuffisance cardiaque modérée — FC max 130, SpO2 > 95% obligatoire. Jamais après 13h.',
    dateCreation: '2026-03-30',
    nombreSeancesTotal: 26,
    nombreSeancesRealisees: 14,
  },

  // ── 6. Thomas Durand — entorse cheville, 2×/semaine ─────────────
  {
    id: 'contrat-demo-6',
    participantId: 'demo-6',
    dateDebut: '2026-04-01',
    dateFin: '2026-06-30',
    joursFixe: ['mar', 'jeu'],
    heureDebut: '16:00',
    dureeMinutes: 45,
    statut: 'actif',
    notes: 'Entorse cheville G grade 2 + douleur genou D. Étudiant BTS — dispo après 14h.',
    dateCreation: '2026-03-30',
    nombreSeancesTotal: 26,
    nombreSeancesRealisees: 13,
  },

  // ── 7a. Yvette Rousseau — T1 TERMINÉ ✅ ─────────────────────────
  {
    id: 'contrat-demo-7a',
    participantId: 'demo-7',
    dateDebut: '2026-01-05',
    dateFin: '2026-03-31',
    joursFixe: ['lun', 'ven'],
    heureDebut: '14:30',
    dureeMinutes: 60,
    statut: 'termine',
    notes: 'T1 terminé — excellente progression, confiance retrouvée. Renouvellement T2 validé.',
    dateCreation: '2026-01-04',
    nombreSeancesTotal: 24,
    nombreSeancesRealisees: 24,
  },

  // ── 7b. Yvette Rousseau — T2 ACTIF, 3×/semaine ──────────────────
  {
    id: 'contrat-demo-7',
    participantId: 'demo-7',
    dateDebut: '2026-04-06',
    dateFin: '2026-06-30',
    joursFixe: ['lun', 'mer', 'ven'],
    heureDebut: '11:30',
    dureeMinutes: 60,
    statut: 'actif',
    notes: 'T2 — fille présente obligatoirement. Renforcement MI avancé, marche extérieure.',
    dateCreation: '2026-04-04',
    nombreSeancesTotal: 39,
    nombreSeancesRealisees: 19,
  },

  // ── 8. Marc Petit — SUSPENDU (chantier BTP) ─────────────────────
  {
    id: 'contrat-demo-8',
    participantId: 'demo-8',
    dateDebut: '2026-02-05',
    dateFin: '2026-07-31',
    joursFixe: ['jeu', 'sam'],
    heureDebut: '07:30',
    dureeMinutes: 45,
    statut: 'suspendu',
    notes: 'Suspendu — chantier BTP grande hauteur jusqu\'à mi-juin. Reprendra en juillet. Jeudi 7h30 car chantier à 9h.',
    dateCreation: '2026-02-04',
    nombreSeancesTotal: 24,
    nombreSeancesRealisees: 13,
  },

  // ── 9. Claudine Fontaine — BPCO, 2×/semaine ─────────────────────
  {
    id: 'contrat-demo-9',
    participantId: 'demo-9',
    dateDebut: '2026-04-01',
    dateFin: '2026-06-30',
    joursFixe: ['mar', 'mer'],
    heureDebut: '08:30',
    dureeMinutes: 45,
    statut: 'actif',
    notes: 'BPCO sévère — oxymètre obligatoire. SpO2 > 92% à l\'effort. Annulation si froid < 10°C ou vent fort.',
    dateCreation: '2026-03-30',
    nombreSeancesTotal: 26,
    nombreSeancesRealisees: 14,
  },

  // ── 10. Lucas Martin — prescription 20 séances ⚠️ EXPIRE BIENTÔT ──
  {
    id: 'contrat-demo-10',
    participantId: 'demo-10',
    dateDebut: '2026-03-16',
    dateFin: '2026-05-28',
    joursFixe: ['lun', 'mar', 'jeu'],
    heureDebut: '15:30',
    dureeMinutes: 45,
    statut: 'actif',
    notes: 'Dr Roux — 20 séances APA proprioception cheville G + renforcement post-entorse LLE.',
    dateCreation: '2026-03-15',
    nombreSeancesTotal: 20,
    nombreSeancesRealisees: 17,
  },
];
