import type {
  QuestionsSenior, QuestionsPostOp, QuestionsChronique,
  QuestionsAdulteActif, QuestionsCommunes, BilanInitialData, OrganisationSeances,
} from '../../../types';

export function emptySenior(): QuestionsSenior {
  return {
    autonomie: { situationVie: null, aideDomicile: null, aideDomicileHeures: null, aideMarche: null, conduit: null },
    chutes: { antecedentChute12mois: null, nombreChutes: null, chutesAvecConsequences: null, peurTomber: null, amenagementDomicile: null },
    sante: { pathologiesConnues: '', traitementsMedicamenteux: null, traitementsDetail: '', troublesVision: null, troublesAuditifs: null, troublesSommeil: null, continence: null },
    cognitionHumeur: { plaintesMemoire: null, suiviPsychologique: null, motivationPratiquer: null },
  };
}

export function emptyPostOp(): QuestionsPostOp {
  return {
    intervention: { typeOperation: null, typeOperationDetail: '', dateIntervention: '', chirurgienEtablissement: '', coteOpere: null, complications: null, complicationsDetail: '' },
    autorisationMedicale: { compteRenduDisponible: null, autorisationAPA: null, restrictionsPrescrites: '', kinesiParallele: null, kinesiFrequence: '' },
    etatActuel: { semainesDepuisOp: null, douleurEVA: null, appareillage: null, autonomie: null, gonflementInflammation: null },
    objectifs: { objectifPrincipal: null, objectifDetail: '', dateRetourSouhaitee: '' },
  };
}

export function emptyChronique(): QuestionsChronique {
  return {
    pathologie: { nature: null, natureDetail: '', ancienneteAnnees: null, medecinReferent: '', derniereConsultation: '' },
    traitementsContre: { traitementEnCours: null, traitementsDetail: '', contreIndicationsEffort: null, contreIndicationsDetail: '', fcMaxAutorisee: null, glycemieASurveiller: null, oxygenneEffort: null },
    toleranceEffort: { dyspneeRepos: null, dyspneeEffort: null, dyspneeNiveau: '', douleursThoraciques: null, fcRepos: null, spo2: null, tensionArterielle: '' },
    modeVie: { tabagisme: null, tabagismeSevre: null, tabagismeDepuis: '', activiteAvantMaladie: null, niveauActuel: null },
  };
}

export function emptyAdulteActif(): QuestionsAdulteActif {
  return {
    blessure: { type: null, typeDetail: '', localisation: '', dateBlessure: '', mecanisme: null, imagerieRealisee: null, imagerieResultat: '' },
    priseEnCharge: { suiviKine: null, suiviKineFrequence: '', medecinSportConsulte: null, arretTravail: null, arretSportif: null, arretSportifDuree: '' },
    etatActuel: { douleurReposEVA: null, douleurEffortEVA: null, appareillage: null, recidive: null, nombreRecidives: null },
    profilSportif: { sportsPratiques: '', niveau: null, frequenceEntrainement: '', objectifRetour: null, delaiSouhaite: '' },
  };
}

export function emptyCommunes(): QuestionsCommunes {
  return {
    alimentation: { variationPoidsRecente: null, variationPoidsKg: null, variationPoidsMois: null, nombreRepasPJour: null, hydratation: null },
    sommeilFatigue: { qualiteSommeil: null, heuresSommeilNuit: null, fatigueQuotidienne: null, fatigueRapideEffort: null, energieMatin: null, energieSoir: null },
    activitePhysique: { niveauActuel: null, activitesActuelles: '', activitesPrecedentes: '', derniereActiviteReguliere: '' },
  };
}

export function emptyOrganisation(): OrganisationSeances {
  return {
    joursDisponibles: [],
    creneau: 'flexible',
    heureSouhaitee: undefined,
    dureeSeanceMinutes: 45,
    contraintes: undefined,
  };
}

export function emptyBilanInitialData(): BilanInitialData {
  return { commune: emptyCommunes() };
}
