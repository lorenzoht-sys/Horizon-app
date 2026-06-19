// ── Normes de notation /5 (adultes 60-80 ans) ─────────────────────────────

interface NormeScoring {
  note1: number; note2: number; note3: number; note4: number;
  lowerIsBetter: boolean;
}

export const NORMES_SCORING: Record<string, NormeScoring> = {
  equilibreUnipodal: { note1: 5,   note2: 10,  note3: 20,  note4: 40,  lowerIsBetter: false },
  chairStand30:      { note1: 5,   note2: 8,   note3: 11,  note4: 14,  lowerIsBetter: false },
  handGrip:          { note1: 15,  note2: 20,  note3: 25,  note4: 32,  lowerIsBetter: false },
  tug3m:             { note1: 20,  note2: 14,  note3: 10,  note4: 8,   lowerIsBetter: true  },
  souplesse:         { note1: -15, note2: -5,  note3: 0,   note4: 10,  lowerIsBetter: false },
  tm6Distance:       { note1: 200, note2: 300, note3: 400, note4: 500, lowerIsBetter: false },
  memoire:           { note1: 3,   note2: 5,   note3: 7,   note4: 9,   lowerIsBetter: false },
  apley:             { note1: 1.49, note2: 2.49, note3: 3.49, note4: 4.0, lowerIsBetter: false },
};

// ── Durées disponibles pour le TM6 en mode "durée fixe" (secondes) ───────
export const TM6_DUREES_FIXES = [120, 240, 360, 480, 600, 720] as const;

export function calculerNote(valeur: number, norme: NormeScoring): 1 | 2 | 3 | 4 | 5 {
  const { note1, note2, note3, note4, lowerIsBetter } = norme;
  if (!lowerIsBetter) {
    if (valeur <= note1) return 1;
    if (valeur <= note2) return 2;
    if (valeur <= note3) return 3;
    if (valeur <= note4) return 4;
    return 5;
  } else {
    if (valeur >= note1) return 1;
    if (valeur >= note2) return 2;
    if (valeur >= note3) return 3;
    if (valeur >= note4) return 4;
    return 5;
  }
}

// ── Normes de normalisation 0-100 (radar chart) ───────────────────────────

// Normes de référence pour la normalisation 0-100 (adultes 65+)
export const NORMS = {
  equilibre: { min: 0, mid: 30, max: 60 },
  chairStand30: { min: 0, mid: 12, max: 20 },
  handGrip: { min: 0, mid: 25, max: 40 },
  tug3m: { min: 20, mid: 12, max: 6 }, // inversé : moins de temps = mieux
  souplesse: { min: -20, mid: 0, max: 20 },
  tm6: { min: 0, mid: 400, max: 700 },
  memoire: { min: 0, mid: 3, max: 5 },
};

export const RADAR_LABELS = [
  'Équilibre',
  'Force MI',
  'Force Mains',
  'Mobilité',
  'Souplesse',
  'Endurance',
];
