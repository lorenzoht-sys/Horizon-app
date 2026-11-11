

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmt(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', options ?? {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function fmtCourt(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function fmtMoisAnnee(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  });
}

export function fmtHeure(h: string): string { return h.slice(0, 5); }

export interface SeancePatientRecord {
  id: string;
  programmeId: string;
  seanceId: string;
  dateSeance: string;
  statut: 'terminee' | 'partielle' | 'en_cours';
  commentairePatient: string | null;
  dureeMinutes: number | null;
  nbRealises: number;
  nbTotal: number;
}

// ── Activités hors programme : tests étalons & exercices libres ────────────

export interface TestEtalonResultatRecord {
  id: string;
  testId: string;
  valeur: number;
  dateTest: string;
}

export interface ExerciceLibreActifRecord {
  id: string;
  exerciceId: string;
  nom: string;
  description: string | null;
  consigneSecurite: string | null;
}

export interface ExerciceLibreValidationRecord {
  exerciceId: string;
  date: string;
  fait: boolean;
}

// Lecture BRUTE du cache, delibérement — contrairement au reste de
// l'application, qui passe par chargerSettingsPraticien().
//
// Cette page s'affiche sur l'appareil du BENEFICIAIRE, ou le cache
// `settings_praticien` n'existe pas et n'a aucune raison d'exister. Les
// valeurs par defaut du module partage (un titre professionnel, notamment)
// affirmeraient ici quelque chose qu'on ne sait pas : mieux vaut le repli
// explicite « votre enseignant APA » que l'identite supposee d'un praticien.
export function loadPraticien() {
  try {
    const s = JSON.parse(localStorage.getItem('settings_praticien') ?? '{}');
    const nom = [s.prenom, s.nom].filter(Boolean).join(' ') || 'votre enseignant APA';
    const societe = s.societe || '';
    return { nom, societe };
  } catch { return { nom: 'votre enseignant APA', societe: '' }; }
}

// ── Couleurs ──────────────────────────────────────────────────────────────────

export const C = {
  dark:    'var(--color-ink)',
  teal:    'var(--color-teal)',
  bg:      'var(--color-bg)',
  border:  '#E0EEEE',
  muted:   '#8FA8A8',
  text:    '#1A3A3A',
  white:   'white',
  green:   '#16A34A',
  orange:  '#EA580C',
  gray:    '#94A3B8',
};

// ── Navigation bas de page ────────────────────────────────────────────────────

export type Tab = 'accueil' | 'progres' | 'programme' | 'documents';
