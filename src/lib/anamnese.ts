import type { Bilan, Participant } from '../types';

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
