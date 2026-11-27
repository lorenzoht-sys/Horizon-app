import type { TagPatient, TestKey } from '../types';

export const ALL_TESTS: TestKey[] = ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'tm6', 'memoire', 'apley', 'tinetti', 'eva', 'berg', 'moca', 'marche10m', 'adl'];

export const TEST_LABELS: Record<TestKey, string> = {
  equilibre:  'Équilibre unipodal',
  chairStand: 'Chair Stand 30s',
  handGrip:   'Hand Grip',
  tug:        'TUG 3m',
  souplesse:  'Souplesse — Distance doigts-sol',
  tm6:        'TM6 — Marche 6 min',
  memoire:    'Mémoire (Dubois)',
  apley:      'Souplesse des épaules (Apley Scratch Test)',
  tinetti:    'Tinetti (POMA) — Équilibre & Marche',
  eva:        'Douleur EVA',
  berg:       'Berg Balance Scale',
  moca:       'MoCA — Cognition',
  marche10m:  'Test de marche 10 m',
  adl:        'ADL / IADL (Katz)',
};

// ── Système de tags multiples ──────────────────────────────────

interface TagConfig {
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
    tests: ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'tm6', 'memoire', 'berg', 'moca', 'marche10m', 'adl'],
    introMessage: 'Bravo {prenom}, votre équilibre et votre forme progressent !',
  },
  post_op: {
    label: 'Post-opératoire',
    emoji: '🏥',
    description: 'Rééducation chirurgicale · Force · Mobilité',
    color: '#BA7517',
    tests: ['chairStand', 'handGrip', 'tug', 'souplesse', 'berg', 'marche10m'],
    introMessage: 'Belle progression dans votre récupération, {prenom} !',
  },
  chronique: {
    label: 'Pathologie chronique',
    emoji: '💊',
    description: 'Cardiaque · BPCO · Diabète · Cancer...',
    color: '#534AB7',
    tests: ['chairStand', 'tug', 'tm6', 'marche10m', 'adl'],
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

// Tag le plus "médical" pour le message client (priorité)
const TAG_PRIORITY: TagPatient[] = ['post_op', 'chronique', 'senior', 'adulte_blessure'];
export function getPriorityTag(tags: TagPatient[]): TagPatient | undefined {
  for (const t of TAG_PRIORITY) {
    if (tags.includes(t)) return t;
  }
  return tags.find(t => t in TAG_CONFIG);
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
  berg:       'Berg',
  adl:        'Autonomie',
  marche10m:  'Vitesse',
  moca:       'MoCA',
};
