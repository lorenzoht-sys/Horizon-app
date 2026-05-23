import { v4 as uuidv4 } from 'uuid';
import type { Bilan } from '../types';

type BilanForm = Omit<Bilan, 'id'>;

export interface BrouillonBilan {
  id: string;
  participantId: string;
  dateCreation: string;
  dateDerniereModif: string;
  etapeActuelle: number;
  data: Partial<BilanForm>;
  completionPct: number;
  estTermine: boolean;
}

const cle = (participantId: string) => `brouillon_bilan_${participantId}`;

export function calculerCompletion(data: Partial<BilanForm>): number {
  const vals = [
    data.equilibre?.droite, data.equilibre?.gauche,
    data.chairStand30,
    data.handGrip?.droite, data.handGrip?.gauche,
    data.tug3m,
    data.souplesse?.valeur,
    data.tm6?.distanceMetres,
    data.memoire?.scoreImmediat, data.memoire?.scoreDiffere,
  ];
  const filled = vals.filter(v => v !== null && v !== undefined).length;
  return Math.round((filled / vals.length) * 100);
}

export function getBrouillon(participantId: string): BrouillonBilan | null {
  try {
    const raw = localStorage.getItem(cle(participantId));
    if (!raw) return null;
    const b: BrouillonBilan = JSON.parse(raw);
    return b.estTermine ? null : b;
  } catch { return null; }
}

export function sauvegarderBrouillon(
  participantId: string,
  etape: number,
  data: Partial<BilanForm>
): void {
  const existant = getBrouillon(participantId);
  const brouillon: BrouillonBilan = {
    id: existant?.id ?? uuidv4(),
    participantId,
    dateCreation: existant?.dateCreation ?? new Date().toISOString(),
    dateDerniereModif: new Date().toISOString(),
    etapeActuelle: etape,
    data,
    completionPct: calculerCompletion(data),
    estTermine: false,
  };
  localStorage.setItem(cle(participantId), JSON.stringify(brouillon));
}

export function supprimerBrouillon(participantId: string): void {
  localStorage.removeItem(cle(participantId));
  // Compatibilité avec l'ancienne clé
  localStorage.removeItem(`bilan_en_cours_${participantId}`);
}

export function getAllBrouillons(): BrouillonBilan[] {
  const result: BrouillonBilan[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('brouillon_bilan_')) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const b: BrouillonBilan = JSON.parse(raw);
      if (!b.estTermine) result.push(b);
    } catch {}
  }
  return result.sort((a, b) => b.dateDerniereModif.localeCompare(a.dateDerniereModif));
}
