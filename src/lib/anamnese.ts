import type { AntecedentMedical, Bilan, JourSemaine, MomentPrise, OrganisationData, Participant, SedentariteReponses, TraitementPatient } from '../types';
import { MOMENTS_PRISE_LABELS, TYPES_ANTECEDENT_LABELS } from '../types';

// Disponibilités : 'Lun'/'Mar'/... (OPTIONS_JOURS_DISPONIBLES, ParticipantForm.tsx) → JourSemaine.
const JOUR_DISPO_TO_JOUR_SEMAINE: Record<string, JourSemaine> = {
  Lun: 'lun', Mar: 'mar', Mer: 'mer', Jeu: 'jeu', Ven: 'ven', Sam: 'sam',
};

// Contre-indications : nouvelle source = fiche patient (anamnese),
// avec repli sur l'ancien emplacement (bilan initial) pour les bilans déjà remplis.
export function getContreIndications(
  participant: Participant,
  bilanInitial?: Bilan | null
): { actif: boolean; detail: string | null } {
  if (participant.anamnese?.contreIndications != null) {
    const actif = participant.anamnese.contreIndications === 'oui';
    return { actif, detail: actif ? (participant.anamnese.contreIndicationsDetail ?? null) : null };
  }
  const bilan = bilanInitial !== undefined ? bilanInitial : (participant.bilans.find(b => b.type === 'initial') ?? null);
  const data = bilan?.bilanInitialData?.formulaireFlat?.data;
  const actif = data?.contreIndications === 'oui';
  return { actif, detail: actif ? (data?.contreIndicationsDetail ?? null) : null };
}

// Tests Ricci & Gagnon (sédentarité) et FSS (fatigue) : nouvelle source = fiche
// patient (anamnese), avec repli sur l'ancien emplacement (bilan initial) pour
// les bilans déjà remplis.
export function getTestsAutonomie(
  participant: Participant,
  bilanInitial?: Bilan | null
): {
  sedentarite: { score: number | null; profil: 'inactif' | 'actif' | 'tres_actif' | null; reponses: SedentariteReponses | null };
  fatigue: { score: number | null; profil: 'pas_de_fatigue' | 'fatigue_probable' | null; reponses: (number | null)[] | null };
} {
  const bilan = bilanInitial !== undefined ? bilanInitial : (participant.bilans.find(b => b.type === 'initial') ?? null);
  const flat = bilan?.bilanInitialData?.formulaireFlat?.data;

  const sedentarite = participant.anamnese?.sedentariteScore != null
    ? {
        score: participant.anamnese.sedentariteScore,
        profil: participant.anamnese.sedentariteProfil ?? null,
        reponses: participant.anamnese.sedentariteReponses ?? null,
      }
    : {
        score: (flat?.sedentariteScore as number | null) ?? null,
        profil: (flat?.sedentariteProfil as 'inactif' | 'actif' | 'tres_actif' | null) ?? null,
        reponses: (flat?.sedentariteReponses as SedentariteReponses | null) ?? null,
      };

  const fatigue = participant.anamnese?.fatigueScore != null
    ? {
        score: participant.anamnese.fatigueScore,
        profil: participant.anamnese.fatigueProfil ?? null,
        reponses: participant.anamnese.fatigueReponses ?? null,
      }
    : {
        score: (flat?.fatigueScore as number | null) ?? null,
        profil: (flat?.fatigueProfil as 'pas_de_fatigue' | 'fatigue_probable' | null) ?? null,
        reponses: (flat?.fatigueReponses as (number | null)[] | null) ?? null,
      };

  return { sedentarite, fatigue };
}

// Mode de déplacement habituel : nouvelle source = fiche patient, avec repli
// sur l'ancien bloc du bilan initial (bulle emoji) pour les bilans déjà remplis.
const MODE_DEPLACEMENT_DEPUIS_BILAN: Record<string, NonNullable<Participant['modeDeplacementHabituel']>> = {
  '🚗 Voiture': 'voiture',
  '🚲 Vélo': 'velo',
  '🚌 Transports': 'transports',
  '🚶 Marche': 'marche',
  '♿ Fauteuil': 'fauteuil',
  '✏️ Autre': 'autre',
};

export function getModeDeplacement(
  participant: Participant,
  bilanInitial?: Bilan | null
): { value: Participant['modeDeplacementHabituel']; detail: string | null } {
  if (participant.modeDeplacementHabituel != null) {
    return { value: participant.modeDeplacementHabituel, detail: participant.modeDeplacementDetail ?? null };
  }
  const bilan = bilanInitial !== undefined ? bilanInitial : (participant.bilans.find(b => b.type === 'initial') ?? null);
  const data = bilan?.bilanInitialData?.formulaireFlat?.data;
  const raw = data?.deplacement as string | undefined;
  return { value: raw ? MODE_DEPLACEMENT_DEPUIS_BILAN[raw] : undefined, detail: null };
}

// Objectifs & activités souhaitées : nouvelle source = fiche patient, avec
// repli sur l'ancien bloc du bilan initial pour les bilans déjà remplis.
export function getObjectifsActivites(
  participant: Participant,
  bilanInitial?: Bilan | null
): { objectifsPatient: string[]; activitesSouhaitees: string[] } {
  const objectifsPatient = Array.isArray(participant.objectifsPatient)
    ? participant.objectifsPatient
    : (participant.objectifsPatient ? [participant.objectifsPatient] : []);
  const activitesSouhaitees = participant.activitesSouhaitees ?? [];
  if (objectifsPatient.length > 0 || activitesSouhaitees.length > 0) {
    return { objectifsPatient, activitesSouhaitees };
  }
  const bilan = bilanInitial !== undefined ? bilanInitial : (participant.bilans.find(b => b.type === 'initial') ?? null);
  const data = bilan?.bilanInitialData?.formulaireFlat?.data;
  return {
    objectifsPatient: (data?.objectifsPatient as string[] | undefined) ?? [],
    activitesSouhaitees: (data?.activitesSouhaitees as string[] | undefined) ?? [],
  };
}

// Traitements : formatage des moments de prise et de la ligne complète,
// utilisés dans la fiche patient, ses exports PDF et le contexte de l'assistant IA.
export function formatMomentsTraitement(moments?: MomentPrise[] | null): string {
  if (!moments || moments.length === 0) return '—';
  return moments.map(m => MOMENTS_PRISE_LABELS[m] ?? m).join(' + ');
}

export function formatTraitementLigne(t: TraitementPatient): string {
  const nomDose = [t.nom, t.dose].filter(Boolean).join(' ');
  const frequence = t.frequence ? ` — ${t.frequence}` : '';
  const moments = (t.moments?.length ?? 0) > 0
    ? ` (${t.moments!.map(m => (MOMENTS_PRISE_LABELS[m] ?? m).toLowerCase()).join(' + ')})`
    : '';
  return `${nomDose}${frequence}${moments}`;
}

// Lignes actives / arrêtées, en ignorant celles ajoutées via "+ Ajouter" dans
// la fiche patient mais jamais renseignées (nom vide) — sinon une section
// "Traitements en cours" vide s'affiche dans la fiche, les exports PDF et le
// contexte de l'assistant IA.
export function getTraitementsActifs(traitements?: TraitementPatient[] | null): TraitementPatient[] {
  return (traitements ?? []).filter(t => !t.date_fin && t.nom?.trim());
}

export function getTraitementsArretes(traitements?: TraitementPatient[] | null): TraitementPatient[] {
  return (traitements ?? []).filter(t => t.date_fin && t.nom?.trim());
}

// Antécédents médicaux structurés : titre saisi par le praticien (avec repli
// sur le libellé du type), icône associée au type, et sous-ligne date/conséquence.
export function getAntecedentIcon(a: AntecedentMedical): string {
  return (TYPES_ANTECEDENT_LABELS[a.type] ?? '📋').split(' ')[0];
}

export function getAntecedentTitre(a: AntecedentMedical): string {
  if (a.titre) return a.titre;
  const label = TYPES_ANTECEDENT_LABELS[a.type] ?? a.type;
  return label.split(' ').slice(1).join(' ') || label;
}

export function getAntecedentSousLigne(a: AntecedentMedical): string {
  return [a.date, a.consequence].filter(Boolean).join(' · ');
}

// Organisation des séances : nouvelle source = fiche patient (anamnese), avec
// repli sur l'ancien bloc du bilan initial pour les bilans déjà remplis.
export function getOrganisation(
  participant: Participant,
  bilanInitial?: Bilan | null
): OrganisationData {
  const organisation = participant.anamnese?.organisation;
  if (organisation && Object.keys(organisation).length > 0) {
    return organisation;
  }
  const bilan = bilanInitial !== undefined ? bilanInitial : (participant.bilans.find(b => b.type === 'initial') ?? null);
  const data = bilan?.bilanInitialData?.formulaireFlat?.data;
  return {
    joursDisponibles: (data?.joursDisponibles as string[] | undefined) ?? [],
    creneau: (data?.creneau as string | null | undefined) ?? null,
    heureSouhaitee: (data?.heureSouhaitee as string | undefined) ?? '',
    dureeSeance: (data?.dureeSeance as string | null | undefined) ?? null,
    contraintes: (data?.contraintes as string | undefined) ?? '',
  };
}

// Jours disponibles du patient, normalisés en JourSemaine ('lun'..'sam') —
// utilisé par le formulaire de contrat (placement initial) et le planificateur
// de tournée (src/lib/planificateur.ts), pour choisir les jours réels de
// passage à partir de la fréquence du contrat (nbSeancesSemaine).
export function getJoursDisponiblesCourts(
  participant: Participant,
  bilanInitial?: Bilan | null
): JourSemaine[] {
  const jours = getOrganisation(participant, bilanInitial).joursDisponibles ?? [];
  return jours
    .map(j => JOUR_DISPO_TO_JOUR_SEMAINE[j])
    .filter((j): j is JourSemaine => Boolean(j));
}
