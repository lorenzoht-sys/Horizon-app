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

export function supprimerBrouillonParticipant(draftKey: string): void {
  localStorage.removeItem(cle(draftKey));
}
