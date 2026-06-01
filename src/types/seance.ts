export interface ExerciceRealise {
  nom: string;
  series: number | null;
  repetitions: number | null;
  dureeSecondes: number | null;
  commentaire: string | null;
}

export type HumeurPatient = 'très bien' | 'bien' | 'moyen' | 'fatigué';
export type ProgressionSeance = 'en progrès' | 'stable' | 'régression';

export interface CompteRenduSeance {
  id: string;
  participantId: string;
  dateSeance: string;
  dureeMinutes: number | null;
  transcriptionBrute: string;
  exercicesRealises: ExerciceRealise[];
  observations: string;
  douleursSignalees: string | null;
  humeurPatient: HumeurPatient | null;
  progression: ProgressionSeance | null;
  pointsAttention: string | null;
  prochaineSeanceNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CompteRenduSeanceInsert = Omit<CompteRenduSeance, 'id' | 'createdAt' | 'updatedAt'>;
