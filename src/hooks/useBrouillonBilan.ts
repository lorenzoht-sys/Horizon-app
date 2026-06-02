import { v4 as uuidv4 } from 'uuid';
import type { Bilan } from '../types';
import { supabase } from '../lib/supabase';

// ── SQL Supabase à exécuter une fois (Settings → SQL Editor) ──────────────────
//
// CREATE TABLE IF NOT EXISTS bilans_brouillons (
//   id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   participant_id  uuid REFERENCES participants(id) ON DELETE CASCADE NOT NULL,
//   praticien_id    uuid NOT NULL,
//   etape_actuelle  integer NOT NULL DEFAULT 0,
//   donnees         jsonb NOT NULL DEFAULT '{}',
//   completion_pct  integer NOT NULL DEFAULT 0,
//   created_at      timestamptz DEFAULT now() NOT NULL,
//   updated_at      timestamptz DEFAULT now() NOT NULL,
//   UNIQUE(participant_id, praticien_id)
// );
// ALTER TABLE bilans_brouillons ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "own" ON bilans_brouillons FOR ALL USING (auth.uid() = praticien_id);
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Isolation par utilisateur ─────────────────────────────────────────────────
let _currentUserId: string | null = null;

export function setCurrentUserId(id: string | null): void {
  _currentUserId = id;
}

/** Supprime tous les brouillons du localStorage (toutes clés bilan_*) */
export function clearAllBrouillons(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('brouillon_bilan_') || key.startsWith('bilan_en_cours_'))) {
      toRemove.push(key);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

const cle = (participantId: string) =>
  `brouillon_bilan_${_currentUserId ?? 'anon'}_${participantId}`;

/** Clé localStorage pour le brouillon de bilan initial (FormulaireBilanInitial) */
export function getBilanEnCoursKey(participantId: string): string {
  return `bilan_en_cours_${_currentUserId ?? 'anon'}_${participantId}`;
}

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

// ── Fonctions Supabase (cloud backup, fail silently si table absente) ─────────

export async function syncBrouillonToSupabase(
  participantId: string,
  brouillon: BrouillonBilan,
  praticienId: string
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('bilans_brouillons')
      .upsert(
        {
          participant_id: participantId,
          praticien_id:   praticienId,
          etape_actuelle: brouillon.etapeActuelle,
          donnees:        brouillon.data,
          completion_pct: brouillon.completionPct,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'participant_id,praticien_id' }
      );
    return !error;
  } catch {
    return false;
  }
}

export async function loadBrouillonFromSupabase(
  participantId: string,
  praticienId: string
): Promise<BrouillonBilan | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('bilans_brouillons')
      .select('*')
      .eq('participant_id', participantId)
      .eq('praticien_id', praticienId)
      .single();
    if (error || !data) return null;
    return {
      id:                  data.id,
      participantId,
      dateCreation:        data.created_at,
      dateDerniereModif:   data.updated_at,
      etapeActuelle:       data.etape_actuelle,
      data:                data.donnees as Partial<BilanForm>,
      completionPct:       data.completion_pct,
      estTermine:          false,
    };
  } catch {
    return null;
  }
}

export async function deleteBrouillonFromSupabase(
  participantId: string,
  praticienId: string
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from('bilans_brouillons')
      .delete()
      .eq('participant_id', participantId)
      .eq('praticien_id',   praticienId);
  } catch { /* non bloquant */ }
}

export function getAllBrouillons(): BrouillonBilan[] {
  const result: BrouillonBilan[] = [];
  const prefix = `brouillon_bilan_${_currentUserId ?? 'anon'}_`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const b: BrouillonBilan = JSON.parse(raw);
      if (!b.estTermine) result.push(b);
    } catch {}
  }
  return result.sort((a, b) => b.dateDerniereModif.localeCompare(a.dateDerniereModif));
}
