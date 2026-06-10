export interface Bilan {
  id: string;
  date: string;
  type: 'initial' | 'trimestriel';
  trimestre: number;

  equilibre: {
    droite: number | null;
    gauche: number | null;
  };

  chairStand30: number | null;

  handGrip: {
    droite: number | null;
    gauche: number | null;
  };

  tug3m: number | null;

  souplesse: {
    methode: 'debout' | 'assis';
    valeur: number | null;
  };

  tm6: {
    mode?: 'standard' | 'marche_sur_place';
    distanceMetres: number | null;
    repetitions?: number | null;
    fcAvant: number | null;
    fcApres: number | null;
    fc2min: number | null;
    spo2Avant: number | null;
    spo2Apres: number | null;
    spo22min: number | null;
    borgRPE: number | null;
  };

  memoire: {
    scoreImmediat: number | null;
    scoreDiffere: number | null;
    dubois?: {
      rappelImmediatLibre: number | null;
      rappelImmediatIndice: number | null;
      rappelDiffereLibre: number | null;
      rappelDiffereIndice: number | null;
      scoreImmediat: number | null;
      scoreDiffere: number | null;
      scoreMIS: number | null;
    };
  };

  apley?: {
    haut_d: string | null;
    haut_g: string | null;
    bas_d: string | null;
    bas_g: string | null;
    score: number | null;
    notes: string;
  };
  notesProfessionnelles: string;
  objectifsSuivants: string;
  pointsVigilance: string;
  messageClient: string;
  profilEnrichi?: ProfilEnrichi;
  bilanInitialData?: BilanInitialData;
  notesBilan?: NotesBilan;
  interpretationIA?: InterpretationIA | null;
}

export interface NotesBilan {
  equilibre?: number;   // 1-5
  force?: number;
  handGrip?: number;
  mobilite?: number;
  souplesse?: number;
  endurance?: number;
  memoire?: number;
}

export interface InterpretationIA {
  textePro: string;
  messageClient: string;
  pointsForts: string[];
  pointsATravail: string[];
  recommandations: string[];
  genereParIA: boolean;
  dateGeneration: string;
}

// ============================================================
// PROFILS PATIENTS — ancien système (conservé pour migration)
// ============================================================

export type ProfilPatient =
  | 'senior_chutes'
  | 'post_operatoire'
  | 'pathologie_chronique'
  | 'adulte_blessure'
  | 'personnalise';

// Nouveau système — tags multiples
export type TagPatient = 'senior' | 'post_op' | 'chronique' | 'adulte_blessure';

export type ProfilHandicap = 'fauteuil_roulant' | 'avc_hemiplegie' | 'parkinson' | 'sep';
export type ProfilPathologie = 'obesite' | 'diabete' | 'prothese_hanche' | 'prothese_genou';

export type TestKey = 'equilibre' | 'chairStand' | 'handGrip' | 'tug' | 'souplesse' | 'tm6' | 'memoire' | 'apley';

export type TypeQuestion = 'texte' | 'note' | 'oui_non';

export interface QuestionPerso {
  id: string;
  label: string;
  type: TypeQuestion;
  repeter: boolean;
  valeur: string | number | boolean | null;
}

export interface ProfilEnrichi {
  chutes12mois: number | null;
  chutesAvecBlessure: boolean | null;
  peurDeTomber: number | null;
  douleursNiveau: number | null;
  douleursLocalisation: string;
  nbMedicaments: number | null;
  anticoagulants: boolean | null;
  activiteHebdoHeures: number | null;
  sedentariteHeures: number | null;
  objectifsPersonnels: string;
  motivationScore: number | null;
  autresInfos: string;
  questionsPerso: QuestionPerso[];
}

// ============================================================
// BILAN INITIAL
// ============================================================

export interface BilanInitialData {
  formulaireFlat?: {
    data: Record<string, any>;
    reponsesClés: Record<string, 'oui' | 'non' | null>;
  };
}

// ── RGPD ─────────────────────────────────────────────────────────────────────

export interface RgpdConsent {
  consentementDate: string;
  consentementObtenu: boolean;
  droitAcces: boolean;
  droitRectification: boolean;
  droitEffacement: boolean;
  methodeConsentement: 'oral_note' | 'ecrit' | 'numerique';
}

export type Direction = 'up' | 'down' | 'equal' | 'first';

export interface DeltaResult {
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: Direction;
  lowerIsBetter: boolean;
  isPositive: boolean;
}

// ============================================================
// EXERCICES & PROGRAMME
// ============================================================

export type CategorieExercice = 'equilibre' | 'force' | 'mobilite' | 'souplesse' | 'endurance' | 'memoire';
export type NiveauExercice = 'debutant' | 'intermediaire' | 'avance';
export type Ressenti = 'bien' | 'moyen' | 'difficile' | 'douleur';

export interface NiveauConfig {
  series: number;
  repetitions: number | null;
  duree_secondes: number | null;
  description: string;
  conseil: string;
}

export interface Exercice {
  id: string;
  nom: string;
  categorie: CategorieExercice;
  description: string;
  consigneSecurite?: string;
  photoUrl?: string;
  videoYoutubeId?: string;
  niveaux: {
    debutant: string;
    intermediaire: string;
    avance: string;
  };
  materielNecessaire?: string;
  dureeEstimeeMinutes: number;
  custom?: boolean;
  profilsCompatibles?: (ProfilHandicap | ProfilPathologie | 'tous')[];
  adaptations?: Partial<Record<ProfilHandicap, string>>;
  positionRequise?: 'debout' | 'assis' | 'couche' | 'fauteuil' | 'tous';
  niveauMobilite?: 'minimal' | 'modere' | 'complet';
  reference?: string;
  niveau_config?: {
    "1": NiveauConfig;
    "2": NiveauConfig;
    "3": NiveauConfig;
  };
}

export interface ExerciceProgramme {
  exerciceId: string;
  niveau: NiveauExercice;
  series: number;
  repetitions?: number;
  dureeSecondes?: number;
  pauseSecondes: number;
  frequenceParSemaine: number[];
  notePersonnalisee?: string;
  ordre: number;
}

export interface SuiviJour {
  exerciceId: string;
  fait: boolean;
  ressenti?: Ressenti;
  notePatient?: string;
}

export interface SuiviSemaine {
  semaine: string;
  jours: Record<string, SuiviJour[]>;
}

export interface Programme {
  id: string;
  participantId: string;
  dateCreation: string;
  dateDebut: string;
  dateFin?: string;
  titre: string;
  objectif: string;
  messageMotivation: string;
  exercices: ExerciceProgramme[];
  actif: boolean;
  suiviSemaines: SuiviSemaine[];
}

// ── ZONES GÉOGRAPHIQUES ───────────────────────────────────────────────────────

export const COULEURS_ZONES = [
  '#1A5F9E', 'var(--color-teal)', '#F59E0B', '#3B6D11', '#8B5CF6', '#EF4444',
];

export interface ZoneGeographique {
  id: string;
  nom: string;
  couleur: string;
  participantIds: string[];
  centroide: { lat: number; lng: number };
  joursAssignes: JourSemaine[];
}

// ── AGENDA & TOURNÉE ──────────────────────────────────────────────────────────

export type JourSemaine = 'lun' | 'mar' | 'mer' | 'jeu' | 'ven' | 'sam';
export type CreneauPreference = 'matin' | 'apres-midi' | 'soiree';
export type StatutSeance = 'planifiee' | 'realisee' | 'annulee' | 'reportee';
export type TypeSeance = 'seance' | 'bilan' | 'bilan_initial';

export interface DisponibilitesPatient {
  joursDisponibles: JourSemaine[];
  creneauxPreference: CreneauPreference[];
  contraintes?: string;
  dureeSeanceMinutes: number;
}

export interface IndisponibilitePierre {
  id: string;
  jour: JourSemaine | 'dim';
  heureDebut: string;
  heureFin: string;
  recurrente: boolean;
  label?: string;
}

export type StatutContrat = 'actif' | 'termine' | 'suspendu' | 'a_venir';

export interface Contrat {
  id: string;
  participantId: string;
  dateDebut: string;
  dateFin: string;
  joursFixe: JourSemaine[];
  heureDebut: string;
  dureeMinutes: number;
  statut: StatutContrat;
  notes?: string;
  dateCreation: string;
  nombreSeancesTotal: number;
  nombreSeancesRealisees: number;
  dureeIndeterminee?: boolean;
  tarifSeance?: number;
}

export interface Seance {
  id: string;
  participantId: string;
  contratId?: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  dureeMinutes: number;
  type: TypeSeance;
  statut: StatutSeance;
  notes?: string;
  adresse: string;
  coordonnees?: { lat: number; lng: number };
}

// ── JOURNAL DE SÉANCE ─────────────────────────────────────────────────────────

export type RessentiSeance = 'excellent' | 'bien' | 'moyen' | 'difficile' | 'arret';

export interface NoteSeance {
  id: string;
  seanceId: string;
  participantId: string;
  date: string;
  heureDebut: string;
  ressenti: RessentiSeance | null;
  note: string;
  alertes: {
    douleurSignalee: boolean;
    fatiguePlusQueHabitude: boolean;
    progressionNotable: boolean;
    pointARevoir: boolean;
  };
  douleurEVA?: number;
  fcFin?: number;
}

// Coordonnées géographiques d'un participant
export interface Coordonnees {
  lat: number;
  lng: number;
  geocodeeAt: string;           // ISO date du dernier géocodage
  adresseNormalisee?: string;   // adresse retournée par l'API
}

// Participant étendu avec programmes
export interface Participant {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string;
  dateCreation: string;
  email?: string;
  telephone?: string;
  pathologie?: string;
  profil?: ProfilPatient;       // legacy — conservé pour migration
  tags?: TagPatient[];           // nouveau système multi-tags
  testsActifs?: TestKey[];
  contexteClinic?: string;
  // Informations complémentaires
  taille?: number;
  poids?: number;
  villeNaissance?: string;
  codePostalNaissance?: string;
  medecinTraitant?: string;
  // Adresse domicile
  adresseRue?: string;
  adresseCodePostal?: string;
  adresseVille?: string;
  // Géolocalisation
  coordonnees?: Coordonnees;
  geocodeFailed?: boolean;       // true si le dernier géocodage a échoué
  disponibilites?: DisponibilitesPatient;
  token: string;
  bilans: Bilan[];
  programmes?: Programme[];
  rgpd?: RgpdConsent;
  profilHandicap?: ProfilHandicap;
  // Profil de vie
  modeDeplacementHabituel?: 'voiture' | 'velo' | 'transports' | 'marche' | 'fauteuil' | 'autre';
  modeDeplacementDetail?: string;
  antecedentsMedicaux?: string;
  antecedentsChirurgicaux?: string;
  allergies?: string;
  traitements?: TraitementPatient[];
  antecedentsMedicauxStructures?: AntecedentMedical[];
  anamnese?: AnamneseData;
  structureId?: string;
  activitesSouhaitees?: string[];
  objectifsPatient?: string | string[];
  // Coordonnées bancaires (SAP)
  iban?: string;
  bic?: string;
  droitImage?: boolean;
}

// ── STRUCTURES ────────────────────────────────────────────────────────────────

export type TypeStructure = 'ehpad' | 'centre' | 'association' | 'entreprise' | 'autre';
export type FrequenceFacturation = 'mensuelle' | 'bimensuelle' | 'a_la_seance';

export interface Structure {
  id: string;
  praticienId: string;
  nom: string;
  type?: TypeStructure;
  adresse?: string;
  contactNom?: string;
  contactEmail: string;
  contactTelephone?: string;
  tokenAcces: string;
  tarifSeance: number;
  frequenceFacturation: FrequenceFacturation;
  actif: boolean;
  createdAt: string;
}

// ── TRAITEMENTS & ANTÉCÉDENTS STRUCTURÉS ─────────────────────────────────────

export interface TraitementPatient {
  id: string;
  nom: string;
  dose?: string;
  effetSecondaire?: string;
  date_fin?: string; // null/undefined = en cours, ISO date = arrêté
}

export type TypeAntecedent =
  | 'pathologie_chronique'
  | 'chirurgie'
  | 'fracture'
  | 'prothese'
  | 'hospitalisation'
  | 'accident'
  | 'autre';

export const TYPES_ANTECEDENT_LABELS: Record<TypeAntecedent, string> = {
  pathologie_chronique: '💊 Pathologie chronique',
  chirurgie: '✂️ Chirurgie',
  fracture: '🦴 Fracture',
  prothese: '🦾 Prothèse',
  hospitalisation: '🏥 Hospitalisation',
  accident: '⚡ Accident',
  autre: '📋 Autre',
};

export interface AntecedentMedical {
  id: string;
  type: TypeAntecedent;
  date?: string;
  localisation?: string;
  consequence?: string;
  douleur?: 'oui' | 'non';
  notes?: string;
}

// ── ANAMNÈSE (état général, hygiène de vie, etc.) ────────────────────────────

export type FourchetteChutes = '1' | '2' | '3-5' | '6+';
export type PeriodeChutes = '<1mois' | '1-3mois' | '3-6mois' | '6-12mois' | '+12mois';

export const PERIODES_CHUTES_LABELS: Record<PeriodeChutes, string> = {
  '<1mois':   'Moins d\'1 mois',
  '1-3mois':  '1 à 3 mois',
  '3-6mois':  '3 à 6 mois',
  '6-12mois': '6 à 12 mois',
  '+12mois':  'Plus de 12 mois',
};

export interface ChutesData {
  aChutes?: 'oui' | 'non' | null;
  nombreChutes?: FourchetteChutes | null;
  periode?: PeriodeChutes | null;
  dateDerniereChute?: string;
  circonstances?: string;
  blessureOccasionnee?: 'oui' | 'non' | null;
  blessureDetail?: string;
  confianceDeplacements?: number | null;
  amenagementDomicile?: 'oui' | 'non' | null;
}

// ── ÉVALUATION GIR (Grille AGGIR) ────────────────────────────────────────────

export interface GIRData {
  mode: 'direct' | 'calcule';
  niveau: number | null;
  methode: 'direct' | 'calcule';
  variables: Record<string, 'A' | 'B' | 'C'>;
}

// ── AUTONOMIE & MODE DE VIE ───────────────────────────────────────────────────

export interface AutonomieData {
  situationVie?: string | null;
  aideADomicile?: 'oui' | 'non' | null;
  aideADomicileHeures?: number | null;
  aideMarche?: string | null;
  gir?: GIRData | null;
}

// ── HABITUDES DE VIE ──────────────────────────────────────────────────────────

export interface HabitudesVieData {
  nombreRepas?: string | null;
  hydratation?: string | null;
  qualiteSommeil?: number | null;
  heuresSommeil?: number | null;
  energieMatin?: number | null;
  energieSoir?: number | null;
  niveauAppetit?: number | null;
  variationPoids?: 'oui' | 'non' | null;
  variationPoidsKg?: number | null;
  tabagisme?: 'oui' | 'non' | null;
}

// ── ACTIVITÉ PHYSIQUE ─────────────────────────────────────────────────────────

export interface ActivitePhysiqueData {
  niveauActivite?: string | null;
  activitesActuelles?: string[];
  activitesPrecedentes?: string[];
  derniereActivite?: string;
}

// ── TESTS RICCI & GAGNON (sédentarité) / FSS (fatigue) ───────────────────────

export type SedentariteReponses = {
  a_sedentarite: number | null;
  b_pratique: 'oui' | 'non' | null;
  b_freq: number | null;
  b_duree: number | null;
  b_effort: number | null;
  c_intensite: number | null;
  c_travaux: number | null;
  c_marche: number | null;
  c_etages: number | null;
};

export interface AnamneseData {
  douleurQuotidienne?: number | null;
  fatigueQuotidienne?: number | null;
  chutes?: ChutesData;
  contreIndications?: 'oui' | 'non' | null;
  contreIndicationsDetail?: string;
  autonomie?: AutonomieData;
  habitudesVie?: HabitudesVieData;
  activitePhysique?: ActivitePhysiqueData;
  sedentariteReponses?: SedentariteReponses;
  sedentariteScore?: number | null;
  sedentariteProfil?: 'inactif' | 'actif' | 'tres_actif' | null;
  fatigueReponses?: (number | null)[];
  fatigueScore?: number | null;
  fatigueProfil?: 'pas_de_fatigue' | 'fatigue_probable' | null;
}

// ── ESPACE PATIENT ────────────────────────────────────────────────────────────

export interface AccesPatient {
  participantId: string;
  visibilite: {
    progression: boolean;
    bilans: boolean;
    rdv: boolean;
    programme: boolean;
    messagePierre: boolean;
  };
  messagePierreTexte?: string;
  dernierAcces?: string;
}

// ── PROGRAMME V2 (structure relationnelle) ────────────────────────────────────

export type TypeProgramme = 'seance' | 'domicile' | 'quotidien' | 'recuperation';
export type JourProgramme = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche';

export const JOURS_PROGRAMME: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export const TYPE_PROGRAMME_LABELS: Record<TypeProgramme, string> = {
  domicile:   'Domicile',
  seance:     'Séance avec praticien',
  quotidien:  'Quotidien',
  recuperation: 'Récupération',
};

export const CATEGORIE_EXERCICE_LABELS: string[] = [
  'Équilibre', 'Force', 'Endurance', 'Souplesse', 'Coordination', 'Respiration',
];

export interface ProgrammeExerciceV2 {
  id: string;
  seanceId: string;
  nom: string;
  categorie?: string;
  description?: string;
  conseilSecurite?: string;
  series?: number;
  repetitions?: number;
  dureeSecondes?: number;
  ordre: number;
  exerciceId?: string;
  niveau?: '1' | '2' | '3';
}

export interface ProgrammeSeanceV2 {
  id: string;
  programmeId: string;
  nom: string;
  description?: string;
  ordre: number;
  exercices: ProgrammeExerciceV2[];
}

export interface ProgrammePlanningV2 {
  id: string;
  programmeId: string;
  seanceId: string;
  jour: JourProgramme;
}

export interface ProgrammeV2 {
  id: string;
  participantId: string;
  nom: string;
  objectif?: string;
  messageMotivation?: string;
  type: TypeProgramme;
  actif: boolean;
  createdAt: string;
  seances: ProgrammeSeanceV2[];
  planning: ProgrammePlanningV2[];
}

