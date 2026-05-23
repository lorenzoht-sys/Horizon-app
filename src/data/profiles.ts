import type { ProfilPatient, TagPatient, TestKey } from '../types';

export interface ProfileConfig {
  label: string;
  emoji: string;
  description: string;
  testsInclus: string;
  color: string;
  testsDefaut: TestKey[];
  introMessage: string;
}

export const ALL_TESTS: TestKey[] = ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'tm6', 'memoire'];

export const PROFILES: Record<ProfilPatient, ProfileConfig> = {
  senior_chutes: {
    label: 'Sénior — Prévention des chutes',
    emoji: '🧓',
    description: 'Équilibre, mémoire, endurance, force',
    testsInclus: 'Équilibre · Chair Stand · Hand Grip · TUG · Souplesse · TM6 · Mémoire',
    color: '#1A5F9E',
    testsDefaut: ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'tm6', 'memoire'],
    introMessage: 'Bravo {prenom}, votre équilibre et votre forme progressent !',
  },
  post_operatoire: {
    label: 'Post-opératoire / Rééducation',
    emoji: '🏥',
    description: 'Force, mobilité, TUG, souplesse',
    testsInclus: 'Équilibre · Chair Stand · Hand Grip · TUG · Souplesse',
    color: '#BA7517',
    testsDefaut: ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse'],
    introMessage: 'Belle progression dans votre récupération, {prenom} !',
  },
  pathologie_chronique: {
    label: 'Pathologie chronique',
    emoji: '💊',
    description: 'Endurance, force, TUG (cardio, BPCO…)',
    testsInclus: 'Chair Stand · TUG · TM6',
    color: '#534AB7',
    testsDefaut: ['chairStand', 'tug', 'tm6'],
    introMessage: 'Votre endurance s\'améliore semaine après semaine, {prenom} !',
  },
  adulte_blessure: {
    label: 'Adulte actif — Reprise blessure',
    emoji: '🏃',
    description: 'Souplesse, endurance, TUG',
    testsInclus: 'TUG · Souplesse · TM6',
    color: '#3B6D11',
    testsDefaut: ['tug', 'souplesse', 'tm6'],
    introMessage: 'Votre retour au sport se passe très bien, {prenom} !',
  },
  personnalise: {
    label: 'Personnalisé',
    emoji: '⚙️',
    description: 'Je choisis les tests librement',
    testsInclus: 'Tous les tests disponibles',
    color: '#5F5E5A',
    testsDefaut: ALL_TESTS,
    introMessage: 'Super bilan ce trimestre, {prenom} !',
  },
};

export const TEST_LABELS: Record<TestKey, string> = {
  equilibre:  'Équilibre unipodal',
  chairStand: 'Chair Stand 30s',
  handGrip:   'Hand Grip',
  tug:        'TUG 3m',
  souplesse:  'Souplesse',
  tm6:        'TM6 — Marche 6 min',
  memoire:    'Mémoire (Dubois)',
};

// ── Système de tags multiples ──────────────────────────────────

export interface TagConfig {
  label: string;
  emoji: string;
  description: string;
  color: string;
  tests: TestKey[];
  introMessage: string;
}

export const TAG_CONFIG: Record<TagPatient, TagConfig> = {
  senior: {
    label: 'Sénior',
    emoji: '🧓',
    description: 'Prévention des chutes · Équilibre · Mémoire',
    color: '#1A5F9E',
    tests: ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'tm6', 'memoire'],
    introMessage: 'Bravo {prenom}, votre équilibre et votre forme progressent !',
  },
  post_op: {
    label: 'Post-opératoire',
    emoji: '🏥',
    description: 'Rééducation chirurgicale · Force · Mobilité',
    color: '#BA7517',
    tests: ['chairStand', 'handGrip', 'tug', 'souplesse'],
    introMessage: 'Belle progression dans votre récupération, {prenom} !',
  },
  chronique: {
    label: 'Pathologie chronique',
    emoji: '💊',
    description: 'Cardiaque · BPCO · Diabète · Cancer...',
    color: '#534AB7',
    tests: ['chairStand', 'tug', 'tm6'],
    introMessage: "Votre endurance s'améliore semaine après semaine, {prenom} !",
  },
  adulte_blessure: {
    label: 'Adulte actif',
    emoji: '🏃',
    description: 'Reprise après blessure · Sport · Trauma',
    color: '#3B6D11',
    tests: ['tug', 'souplesse', 'tm6'],
    introMessage: 'Votre retour au sport se passe très bien, {prenom} !',
  },
};

export const TAG_ORDER: TagPatient[] = ['senior', 'post_op', 'chronique', 'adulte_blessure'];

// Union des tests selon les tags cochés
export function buildTestsActifs(tags: TagPatient[]): TestKey[] {
  return [...new Set(tags.flatMap(tag => TAG_CONFIG[tag].tests))];
}

// Tag le plus "médical" pour le message client (priorité)
const TAG_PRIORITY: TagPatient[] = ['post_op', 'chronique', 'senior', 'adulte_blessure'];
export function getPriorityTag(tags: TagPatient[]): TagPatient | undefined {
  for (const t of TAG_PRIORITY) {
    if (tags.includes(t)) return t;
  }
  return tags[0];
}

// Mapping TestKey → axe radar
export const TEST_RADAR_LABELS: Partial<Record<TestKey, string>> = {
  equilibre:  'Équilibre',
  chairStand: 'Force MI',
  handGrip:   'Force Mains',
  tug:        'Mobilité',
  souplesse:  'Souplesse',
  tm6:        'Endurance',
  memoire:    'Mémoire',
};
