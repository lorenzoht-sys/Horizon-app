import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { dbToStructure, structureToDb } from '../lib/mappers';
import type { Structure } from '../types';

export type { Structure };

export function useStructures() {
  const [structures, setStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(false);
  const [praticienId, setPraticienId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setPraticienId(user.id);
    });
  }, []);

  const charger = useCallback(async () => {
    if (!supabase || !praticienId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('structures')
        .select('*')
        .eq('praticien_id', praticienId)
        .order('nom');
      if (data) setStructures(data.map(dbToStructure));
    } finally {
      setLoading(false);
    }
  }, [praticienId]);

  useEffect(() => {
    if (praticienId) void charger();
  }, [praticienId, charger]);

  function genToken(): string {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // [F-04, docs/RAPPORT_SECURITE.md] Durée de validité d'un lien de
  // structure : 1 an à partir de la (re)génération. Un token existant
  // (expires_at NULL, créé avant cette colonne) n'expire pas
  // rétroactivement — seuls les tokens émis/régénérés à partir de
  // maintenant portent une expiration.
  function dansUnAn(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }

  async function creerStructure(data: {
    nom: string;
    type?: Structure['type'];
    adresse?: string;
    contactNom?: string;
    contactEmail: string;
    contactTelephone?: string;
    tarifSeance?: number;
    frequenceFacturation?: Structure['frequenceFacturation'];
  }): Promise<Structure | null> {
    if (!supabase || !praticienId) {
      console.error('[useStructures] pas de supabase ou praticienId:', { supabase: !!supabase, praticienId });
      return null;
    }
    const row = {
      ...structureToDb({ ...data, tarifSeance: data.tarifSeance ?? 45 }),
      id: uuidv4(),
      praticien_id: praticienId,
      token_acces: genToken(),  // généré côté client, pas de dépendance pgcrypto
      expires_at: dansUnAn(),
    };
    const { data: inserted, error } = await supabase
      .from('structures')
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error('[useStructures] create error:', error.message, error.details, error.hint);
      return null;
    }
    const s = dbToStructure(inserted);
    setStructures(prev => [...prev, s].sort((a, b) => a.nom.localeCompare(b.nom)));
    return s;
  }

  async function mettreAJour(id: string, data: Partial<Omit<Structure, 'id' | 'praticienId' | 'tokenAcces' | 'createdAt'>>): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('structures').update(structureToDb(data as any)).eq('id', id);
    if (!error) {
      setStructures(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }
  }

  async function supprimerStructure(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('structures').delete().eq('id', id);
    setStructures(prev => prev.filter(s => s.id !== id));
  }

  async function regenererToken(id: string): Promise<string | null> {
    if (!supabase) return null;
    // Générer un nouveau token côté client (hex 32 bytes via crypto API)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    const expiresAt = dansUnAn();
    const { error } = await supabase.from('structures').update({ token_acces: token, expires_at: expiresAt }).eq('id', id);
    if (!error) {
      setStructures(prev => prev.map(s => s.id === id ? { ...s, tokenAcces: token, expiresAt } : s));
      return token;
    }
    return null;
  }

  return {
    structures,
    loading,
    praticienId,
    creerStructure,
    mettreAJour,
    supprimerStructure,
    regenererToken,
    recharger: charger,
  };
}

// Accès public : vérification token (sans auth)
export async function verifierTokenStructure(token: string): Promise<{
  id: string; nom: string; actif: boolean; praticienId: string;
} | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('structures')
    .select('id, nom, actif, praticien_id')
    .eq('token_acces', token)
    .single();
  if (error || !data || !data.actif) return null;
  return { id: data.id, nom: data.nom, actif: data.actif, praticienId: data.praticien_id };
}
