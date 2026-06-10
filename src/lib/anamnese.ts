import type { Bilan, Participant, SedentariteReponses } from '../types';

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
