// Brouillon (localStorage) pour le formulaire participant en plusieurs étapes
// (page "Nouveau participant" / "Modifier le participant")

export interface BrouillonParticipant {
  step: number;
  data: Record<string, any>;
  timestamp: number;
}

const PREFIX = 'participant_brouillon_';

function cle(draftKey: string): string {
  return `${PREFIX}${draftKey}`;
}

export function getBrouillonParticipant(draftKey: string): BrouillonParticipant | null {
  try {
    const raw = localStorage.getItem(cle(draftKey));
    if (!raw) return null;
    const b: BrouillonParticipant = JSON.parse(raw);
    if (Date.now() - b.timestamp > 86_400_000) return null;
    return b;
  } catch {
    return null;
  }
}

export function sauvegarderBrouillonParticipant(draftKey: string, step: number, data: Record<string, any>): void {
  try {
    localStorage.setItem(cle(draftKey), JSON.stringify({ step, data, timestamp: Date.now() }));
  } catch {
    // quota dépassé : non bloquant
  }
}

// Horodatage de la dernière suppression, par clé : voir la même mécanique dans
// useBrouillonBilan.ts. Empêche un formulaire qui disparaît de recréer un
// brouillon supprimé volontairement (fiche créée, « Annuler »).
const suppressions = new Map<string, number>();

export function supprimerBrouillonParticipant(draftKey: string): void {
  localStorage.removeItem(cle(draftKey));
  suppressions.set(cle(draftKey), Date.now());
}

export function brouillonParticipantSupprimeDepuis(draftKey: string, depuis: number): boolean {
  // Strictement après : une suppression suivie d'une réouverture dans la même
  // milliseconde ne doit pas empêcher de sauvegarder le formulaire rouvert.
  return (suppressions.get(cle(draftKey)) ?? 0) > depuis;
}
