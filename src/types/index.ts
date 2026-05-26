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
    distanceMetres: number | null;
    fcAvant: number | null;
    fcApres: number | null;
    fc2min: number | null;
    spo2Avant: number | null;
    spo2Apres: number | null;
    spo22min: number | null;
    ressentiBorg: number | null;
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

export type TestKey = 'equilibre' | 'chairStand' | 'handGrip' | 'tug' | 'souplesse' | 'tm6' | 'memoire';

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
// BILAN INITIAL — Questions par profil
// ============================================================

export interface QuestionsCommunes {
  alimentation: {
    variationPoidsRecente: boolean | null;
    variationPoidsKg: number | null;
    variationPoidsMois: number | null;
    nombreRepasPJour: '1' | '2' | '3' | 'plus' | null;
    hydratation: 'moins1L' | '1a1_5L' | 'plus1_5L' | null;
  };
  sommeilFatigue: {
    qualiteSommeil: number | null;
    heuresSommeilNuit: number | null;
    fatigueQuotidienne: number | null;
    fatigueRapideEffort: boolean | null;
    energieMatin: number | null;
    energieSoir: number | null;
  };
  activitePhysique: {
    niveauActuel: 'sedentaire' | 'leger' | 'moderement_actif' | null;
    activitesActuelles: string;
    activitesPrecedentes: string;
    derniereActiviteReguliere: string;
  };
}

export interface QuestionsSenior {
  autonomie: {
    situationVie: 'seul' | 'famille' | 'ehpad' | 'autre' | null;
    aideDomicile: boolean | null;
    aideDomicileHeures: number | null;
    aideMarche: 'aucune' | 'canne' | 'deambulateur' | 'autre' | null;
    conduit: boolean | null;
  };
  chutes: {
    antecedentChute12mois: boolean | null;
    nombreChutes: number | null;
    chutesAvecConsequences: boolean | null;
    peurTomber: number | null;
    amenagementDomicile: boolean | null;
  };
  sante: {
    pathologiesConnues: string;
    traitementsMedicamenteux: boolean | null;
    traitementsDetail: string;
    troublesVision: boolean | null;
    troublesAuditifs: boolean | null;
    troublesSommeil: boolean | null;
    continence: 'aucun' | 'urgences' | 'incontinence' | null;
  };
  cognitionHumeur: {
    plaintesMemoire: boolean | null;
    suiviPsychologique: boolean | null;
    motivationPratiquer: number | null;
  };
}

export interface QuestionsPostOp {
  intervention: {
    typeOperation: 'PTH' | 'PTG' | 'ligaments' | 'rachis' | 'epaule' | 'autre' | null;
    typeOperationDetail: string;
    dateIntervention: string;
    chirurgienEtablissement: string;
    coteOpere: 'droit' | 'gauche' | 'bilateral' | null;
    complications: boolean | null;
    complicationsDetail: string;
  };
  autorisationMedicale: {
    compteRenduDisponible: boolean | null;
    autorisationAPA: boolean | null;
    restrictionsPrescrites: string;
    kinesiParallele: boolean | null;
    kinesiFrequence: string;
  };
  etatActuel: {
    semainesDepuisOp: number | null;
    douleurEVA: number | null;
    appareillage: 'aucun' | 'attelle' | 'bequilles' | 'autre' | null;
    autonomie: 'totale' | 'partielle' | 'aidee' | null;
    gonflementInflammation: boolean | null;
  };
  objectifs: {
    objectifPrincipal: 'retour_sport' | 'reprise_travail' | 'autonomie' | 'autre' | null;
    objectifDetail: string;
    dateRetourSouhaitee: string;
  };
}

export interface QuestionsChronique {
  pathologie: {
    nature: 'cardiaque' | 'bpco' | 'diabete' | 'obesite' | 'cancer' | 'neurologique' | 'autre' | null;
    natureDetail: string;
    ancienneteAnnees: number | null;
    medecinReferent: string;
    derniereConsultation: string;
  };
  traitementsContre: {
    traitementEnCours: boolean | null;
    traitementsDetail: string;
    contreIndicationsEffort: boolean | null;
    contreIndicationsDetail: string;
    fcMaxAutorisee: number | null;
    glycemieASurveiller: boolean | null;
    oxygenneEffort: boolean | null;
  };
  toleranceEffort: {
    dyspneeRepos: boolean | null;
    dyspneeEffort: boolean | null;
    dyspneeNiveau: string;
    douleursThoraciques: boolean | null;
    fcRepos: number | null;
    spo2: number | null;
    tensionArterielle: string;
  };
  modeVie: {
    tabagisme: boolean | null;
    tabagismeSevre: boolean | null;
    tabagismeDepuis: string;
    activiteAvantMaladie: 'sedentaire' | 'actif' | 'sportif' | null;
    niveauActuel: 'sedentaire' | 'leger' | 'moderement_actif' | null;
  };
}

export interface QuestionsAdulteActif {
  blessure: {
    type: 'musculaire' | 'ligamentaire' | 'tendineuse' | 'fracture' | 'autre' | null;
    typeDetail: string;
    localisation: string;
    dateBlessure: string;
    mecanisme: 'traumatique' | 'surmenage' | 'autre' | null;
    imagerieRealisee: boolean | null;
    imagerieResultat: string;
  };
  priseEnCharge: {
    suiviKine: boolean | null;
    suiviKineFrequence: string;
    medecinSportConsulte: boolean | null;
    arretTravail: boolean | null;
    arretSportif: boolean | null;
    arretSportifDuree: string;
  };
  etatActuel: {
    douleurReposEVA: number | null;
    douleurEffortEVA: number | null;
    appareillage: 'aucun' | 'orthese' | 'strapping' | 'autre' | null;
    recidive: boolean | null;
    nombreRecidives: number | null;
  };
  profilSportif: {
    sportsPratiques: string;
    niveau: 'loisir' | 'competition' | 'professionnel' | null;
    frequenceEntrainement: string;
    objectifRetour: 'meme_sport' | 'autre_sport' | 'activite_generale' | null;
    delaiSouhaite: string;
  };
}

export interface BilanInitialData {
  commune?: QuestionsCommunes;
  senior?: QuestionsSenior;
  postOperatoire?: QuestionsPostOp;
  chronique?: QuestionsChronique;
  adulteActif?: QuestionsAdulteActif;
  organisation?: OrganisationSeances;
  formulaireFlat?: {
    data: Record<string, any>;
    reponsesClés: Record<string, 'oui' | 'non' | null>;
  };
}

export interface OrganisationSeances {
  joursDisponibles: JourSemaine[];
  creneau: 'matin' | 'apres-midi' | 'flexible';
  heureSouhaitee?: string;
  dureeSeanceMinutes: number;
  contraintes?: string;
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
  profilsCompatibles?: (ProfilHandicap | 'tous')[];
  adaptations?: Partial<Record<ProfilHandicap, string>>;
  positionRequise?: 'debout' | 'assis' | 'couche' | 'fauteuil' | 'tous';
  niveauMobilite?: 'minimal' | 'modere' | 'complet';
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
  '#1A5F9E', '#2BBFBF', '#F59E0B', '#3B6D11', '#8B5CF6', '#EF4444',
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
  activitesSouhaitees?: string[];
  objectifsPatient?: string | string[];
  // Coordonnées bancaires (SAP)
  iban?: string;
  bic?: string;
}
