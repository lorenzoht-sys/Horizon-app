import type { Participant, Bilan, Programme, Contrat, Seance, NoteSeance, ZoneGeographique, Structure } from '../types';
import type { CompteRenduSeance } from '../types/seance';

// Participant: Supabase row → TypeScript type
export function dbToParticipant(row: any): Participant {
  return {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    dateNaissance: row.date_naissance ?? '',
    dateCreation: row.date_creation ?? '',
    email: row.email ?? undefined,
    telephone: row.telephone ?? undefined,
    pathologie: row.pathologie ?? undefined,
    profil: row.profil ?? undefined,
    tags: row.tags ?? [],
    testsActifs: row.tests_actifs ?? undefined,
    contexteClinic: row.contexte_clinic ?? undefined,
    taille: row.taille ?? undefined,
    poids: row.poids ?? undefined,
    villeNaissance: row.ville_naissance ?? undefined,
    codePostalNaissance: row.code_postal_naissance ?? row.cp_naissance ?? undefined,
    medecinTraitant: row.medecin_traitant ?? undefined,
    adresseRue: row.adresse_rue ?? undefined,
    adresseCodePostal: row.adresse_code_postal ?? undefined,
    adresseVille: row.adresse_ville ?? undefined,
    coordonnees: row.coordonnees_lat != null ? {
      lat: row.coordonnees_lat,
      lng: row.coordonnees_lng,
      geocodeeAt: '',
    } : undefined,
    geocodeFailed: false,
    disponibilites: undefined,
    token: row.token ?? '',
    profilHandicap: row.profil_handicap ?? undefined,
    modeDeplacementHabituel: row.mode_deplacement ?? undefined,
    modeDeplacementDetail: row.mode_deplacement_detail ?? undefined,
    antecedentsMedicaux: row.antecedents_medicaux ?? undefined,
    antecedentsChirurgicaux: row.antecedents_chirurgicaux ?? undefined,
    allergies: row.allergies ?? undefined,
    traitements: row.traitements ?? undefined,
    antecedentsMedicauxStructures: row.antecedents_structures ?? undefined,
    anamnese: row.anamnese ?? undefined,
    structureId: row.structure_id ?? undefined,
    activitesSouhaitees: row.activites_souhaitees ?? undefined,
    objectifsPatient: row.objectifs_patient ?? undefined,
    iban: row.iban ?? undefined,
    bic: row.bic ?? undefined,
    droitImage: row.droit_image ?? undefined,
    rgpd: row.rgpd ?? undefined,
    bilans: (row.bilans ?? []).map(dbToBilan),
    programmes: (row.programmes ?? []).map(dbToProgramme),
  };
}

// Participant TypeScript → Supabase insert/update object
// Colonnes exactes de la table participants Supabase
export function participantToDb(p: Omit<Participant, 'bilans' | 'programmes'>): Record<string, unknown> {
  return {
    id: p.id,
    nom: p.nom,
    prenom: p.prenom,
    date_naissance: p.dateNaissance || null,
    date_creation: p.dateCreation || null,
    email: p.email ?? null,
    telephone: p.telephone ?? null,
    pathologie: p.pathologie ?? null,
    profil: p.profil ?? null,
    tags: p.tags ?? [],
    tests_actifs: p.testsActifs ?? null,
    contexte_clinic: p.contexteClinic ?? null,
    profil_handicap: p.profilHandicap ?? null,
    taille: p.taille ?? null,
    poids: p.poids ?? null,
    ville_naissance: p.villeNaissance ?? null,
    code_postal_naissance: p.codePostalNaissance ?? null,
    cp_naissance: p.codePostalNaissance ?? null,
    medecin_traitant: p.medecinTraitant ?? null,
    adresse_rue: p.adresseRue ?? null,
    adresse_code_postal: p.adresseCodePostal ?? null,
    adresse_ville: p.adresseVille ?? null,
    coordonnees_lat: p.coordonnees?.lat ?? null,
    coordonnees_lng: p.coordonnees?.lng ?? null,
    mode_deplacement: p.modeDeplacementHabituel ?? null,
    mode_deplacement_detail: p.modeDeplacementDetail ?? null,
    antecedents_medicaux: p.antecedentsMedicaux ?? null,
    antecedents_chirurgicaux: p.antecedentsChirurgicaux ?? null,
    allergies: p.allergies ?? null,
    traitements: p.traitements ?? null,
    antecedents_structures: p.antecedentsMedicauxStructures ?? null,
    anamnese: p.anamnese ?? null,
    structure_id: p.structureId ?? null,
    activites_souhaitees: p.activitesSouhaitees ?? null,
    objectifs_patient: p.objectifsPatient ?? null,
    iban: p.iban ?? null,
    bic: p.bic ?? null,
    droit_image: p.droitImage ?? null,
    rgpd: p.rgpd ?? null,
  };
}

export function dbToBilan(row: any): Bilan {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    trimestre: row.trimestre ?? 0,
    equilibre: { droite: row.equilibre_droite, gauche: row.equilibre_gauche },
    chairStand30: row.chair_stand_30,
    handGrip: { droite: row.hand_grip_droite, gauche: row.hand_grip_gauche },
    tug3m: row.tug_3m,
    souplesse: { methode: row.souplesse_methode ?? 'debout', valeur: row.souplesse_valeur },
    tm6: {
      distanceMetres: row.tm6_distance_metres,
      fcAvant: row.tm6_fc_avant,
      fcApres: row.tm6_fc_apres,
      fc2min: row.tm6_fc_2min,
      spo2Avant: row.tm6_spo2_avant,
      spo2Apres: row.tm6_spo2_apres,
      spo22min: row.tm6_spo2_2min,
      borgRPE: row.tm6_borg_rpe,
    },
    memoire: {
      scoreImmediat: row.memoire_score_immediat,
      scoreDiffere: row.memoire_score_differe,
      dubois: row.memoire_dubois ?? undefined,
    },
    notesProfessionnelles: row.notes_professionnelles ?? '',
    objectifsSuivants: row.objectifs_suivants ?? '',
    pointsVigilance: row.points_vigilance ?? '',
    messageClient: row.message_client ?? '',
    profilEnrichi: row.profil_enrichi ?? undefined,
    bilanInitialData: row.bilan_initial_data ?? undefined,
    notesBilan: row.notes_bilan ?? undefined,
    interpretationIA: row.interpretation_ia ?? undefined,
  };
}

export function bilanToDb(participantId: string, b: Omit<Bilan, 'id'> & { id?: string }): Record<string, unknown> {
  return {
    ...(b.id ? { id: b.id } : {}),
    participant_id: participantId,
    date: b.date,
    type: b.type,
    trimestre: b.trimestre ?? null,
    equilibre_droite: b.equilibre?.droite ?? null,
    equilibre_gauche: b.equilibre?.gauche ?? null,
    chair_stand_30: b.chairStand30 ?? null,
    hand_grip_droite: b.handGrip?.droite ?? null,
    hand_grip_gauche: b.handGrip?.gauche ?? null,
    tug_3m: b.tug3m ?? null,
    souplesse_methode: b.souplesse?.methode ?? null,
    souplesse_valeur: b.souplesse?.valeur ?? null,
    tm6_distance_metres: b.tm6?.distanceMetres ?? null,
    tm6_fc_avant: b.tm6?.fcAvant ?? null,
    tm6_fc_apres: b.tm6?.fcApres ?? null,
    tm6_fc_2min: b.tm6?.fc2min ?? null,
    tm6_spo2_avant: b.tm6?.spo2Avant ?? null,
    tm6_spo2_apres: b.tm6?.spo2Apres ?? null,
    tm6_spo2_2min: b.tm6?.spo22min ?? null,
    tm6_borg_rpe: b.tm6?.borgRPE ?? null,
    memoire_score_immediat: b.memoire?.scoreImmediat ?? null,
    memoire_score_differe: b.memoire?.scoreDiffere ?? null,
    memoire_dubois: b.memoire?.dubois ?? null,
    notes_professionnelles: b.notesProfessionnelles ?? '',
    objectifs_suivants: b.objectifsSuivants ?? '',
    points_vigilance: b.pointsVigilance ?? '',
    message_client: b.messageClient ?? '',
    profil_enrichi: b.profilEnrichi ?? null,
    bilan_initial_data: b.bilanInitialData ?? null,
    notes_bilan: b.notesBilan ?? null,
    interpretation_ia: b.interpretationIA ?? null,
    sedentarite_score: b.bilanInitialData?.formulaireFlat?.data?.sedentariteScore ?? null,
    sedentarite_profil: b.bilanInitialData?.formulaireFlat?.data?.sedentariteProfil ?? null,
    fatigue_score: b.bilanInitialData?.formulaireFlat?.data?.fatigueScore ?? null,
    fatigue_profil: b.bilanInitialData?.formulaireFlat?.data?.fatigueProfil ?? null,
    sedentarite_reponses: b.bilanInitialData?.formulaireFlat?.data?.sedentariteReponses ?? null,
    fatigue_reponses: b.bilanInitialData?.formulaireFlat?.data?.fatigueReponses ?? null,
  };
}

export function dbToProgramme(row: any): Programme {
  return {
    id: row.id,
    participantId: row.participant_id,
    dateCreation: row.date_creation,
    dateDebut: row.date_debut,
    dateFin: row.date_fin ?? undefined,
    titre: row.titre ?? row.nom ?? '',
    objectif: row.objectif ?? '',
    messageMotivation: row.message_motivation ?? '',
    exercices: row.exercices ?? [],
    actif: row.actif,
    suiviSemaines: row.suivi_semaines ?? [],
  };
}

export function programmeToDb(p: Programme): Record<string, unknown> {
  return {
    id: p.id,
    participant_id: p.participantId,
    date_creation: p.dateCreation || null,
    date_debut: p.dateDebut,
    date_fin: p.dateFin ?? null,
    titre: p.titre,
    objectif: p.objectif ?? null,
    message_motivation: p.messageMotivation ?? null,
    exercices: p.exercices,
    actif: p.actif,
    suivi_semaines: p.suiviSemaines,
  };
}

export function dbToContrat(row: any): Contrat {
  return {
    id: row.id,
    participantId: row.participant_id,
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    joursFixe: row.jours_fixe ?? [],
    heureDebut: row.heure_debut,
    dureeMinutes: row.duree_minutes,
    statut: row.statut,
    notes: row.notes ?? undefined,
    dateCreation: row.date_creation,
    nombreSeancesTotal: row.nombre_seances_total,
    nombreSeancesRealisees: row.nombre_seances_realisees,
    dureeIndeterminee: row.duree_indeterminee ?? false,
    tarifSeance: row.tarif_seance ?? undefined,
  };
}

export function contratToDb(c: Contrat): Record<string, unknown> {
  return {
    id: c.id,
    participant_id: c.participantId,
    date_debut: c.dateDebut,
    date_fin: c.dateFin,
    jours_fixe: c.joursFixe,
    heure_debut: c.heureDebut,
    duree_minutes: c.dureeMinutes,
    statut: c.statut,
    notes: c.notes ?? null,
    date_creation: c.dateCreation || null,
    nombre_seances_total: c.nombreSeancesTotal,
    nombre_seances_realisees: c.nombreSeancesRealisees,
    duree_indeterminee: c.dureeIndeterminee ?? false,
    tarif_seance: c.tarifSeance ?? null,
  };
}

export function dbToSeance(row: any): Seance {
  return {
    id: row.id,
    participantId: row.participant_id,
    contratId: row.contrat_id ?? undefined,
    date: row.date,
    heureDebut: row.heure_debut,
    heureFin: row.heure_fin,
    dureeMinutes: row.duree_minutes,
    type: row.type,
    statut: row.statut,
    notes: row.notes ?? undefined,
    adresse: row.adresse ?? '',
    coordonnees: row.coordonnees ?? undefined,
  };
}

export function seanceToDb(s: Omit<Seance, 'id'> & { id?: string }): Record<string, unknown> {
  return {
    ...(s.id ? { id: s.id } : {}),
    participant_id: s.participantId,
    contrat_id: s.contratId ?? null,
    date: s.date,
    heure_debut: s.heureDebut,
    heure_fin: s.heureFin,
    duree_minutes: s.dureeMinutes,
    type: s.type,
    statut: s.statut,
    notes: s.notes ?? null,
    adresse: s.adresse ?? null,
    coordonnees: s.coordonnees ?? null,
  };
}

export function dbToNoteSeance(row: any): NoteSeance {
  return {
    id: row.id,
    seanceId: row.seance_id,
    participantId: row.participant_id,
    date: row.date,
    heureDebut: row.heure_debut ?? '',
    ressenti: row.ressenti,
    note: row.note ?? '',
    alertes: row.alertes ?? { douleurSignalee: false, fatiguePlusQueHabitude: false, progressionNotable: false, pointARevoir: false },
    douleurEVA: row.douleur_eva ?? undefined,
    fcFin: row.fc_fin ?? undefined,
  };
}

export function noteSeanceToDb(n: Omit<NoteSeance, 'id'> & { id?: string }): Record<string, unknown> {
  return {
    ...(n.id ? { id: n.id } : {}),
    seance_id: n.seanceId,
    participant_id: n.participantId,
    date: n.date,
    heure_debut: n.heureDebut ?? null,
    ressenti: n.ressenti ?? null,
    note: n.note ?? null,
    alertes: n.alertes ?? null,
    douleur_eva: n.douleurEVA ?? null,
    fc_fin: n.fcFin ?? null,
  };
}

export function dbToZone(row: any): ZoneGeographique {
  return {
    id: row.id,
    nom: row.nom,
    couleur: row.couleur,
    participantIds: row.participant_ids ?? [],
    centroide: { lat: row.centroide_lat ?? 0, lng: row.centroide_lng ?? 0 },
    joursAssignes: row.jours_assignes ?? [],
  };
}

export function zoneToDb(z: ZoneGeographique): Record<string, unknown> {
  return {
    id: z.id,
    nom: z.nom,
    couleur: z.couleur,
    participant_ids: z.participantIds,
    centroide_lat: z.centroide.lat,
    centroide_lng: z.centroide.lng,
    jours_assignes: z.joursAssignes,
  };
}

export function dbToCompteRendu(row: any): CompteRenduSeance {
  return {
    id: row.id,
    participantId: row.participant_id,
    dateSeance: row.date_seance,
    dureeMinutes: row.duree_minutes ?? null,
    transcriptionBrute: row.transcription_brute ?? '',
    exercicesRealises: row.exercices_realises ?? [],
    observations: row.observations ?? '',
    douleursSignalees: row.douleurs_signalees ?? null,
    humeurPatient: row.humeur_patient ?? null,
    progression: row.progression ?? null,
    pointsAttention: row.points_attention ?? null,
    prochaineSeanceNotes: row.prochaine_seance_notes ?? null,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

export function compteRenduToDb(cr: CompteRenduSeance): Record<string, unknown> {
  return {
    id: cr.id,
    participant_id: cr.participantId,
    date_seance: cr.dateSeance,
    duree_minutes: cr.dureeMinutes ?? null,
    transcription_brute: cr.transcriptionBrute,
    exercices_realises: cr.exercicesRealises,
    observations: cr.observations,
    douleurs_signalees: cr.douleursSignalees ?? null,
    humeur_patient: cr.humeurPatient ?? null,
    progression: cr.progression ?? null,
    points_attention: cr.pointsAttention ?? null,
    prochaine_seance_notes: cr.prochaineSeanceNotes ?? null,
  };
}

export function dbToStructure(row: any): Structure {
  return {
    id: row.id,
    praticienId: row.praticien_id,
    nom: row.nom,
    type: row.type ?? undefined,
    adresse: row.adresse ?? undefined,
    contactNom: row.contact_nom ?? undefined,
    contactEmail: row.contact_email,
    contactTelephone: row.contact_telephone ?? undefined,
    tokenAcces: row.token_acces,
    tarifSeance: Number(row.tarif_seance ?? 45),
    frequenceFacturation: row.frequence_facturation ?? 'mensuelle',
    actif: row.actif ?? true,
    createdAt: row.created_at ?? '',
  };
}

export function structureToDb(s: Partial<Structure> & { nom: string; contactEmail: string }): Record<string, unknown> {
  return {
    ...(s.id ? { id: s.id } : {}),
    ...(s.praticienId ? { praticien_id: s.praticienId } : {}),
    nom: s.nom,
    type: s.type ?? null,
    adresse: s.adresse ?? null,
    contact_nom: s.contactNom ?? null,
    contact_email: s.contactEmail,
    contact_telephone: s.contactTelephone ?? null,
    tarif_seance: s.tarifSeance ?? 45,
    frequence_facturation: s.frequenceFacturation ?? 'mensuelle',
    actif: s.actif ?? true,
  };
}
