import { useState, useEffect, useCallback, useRef } from 'react';
import type { Participant, Bilan } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { generateToken } from '../utils/generateToken';
import { geocodeAdresse } from '../utils/geocodeAdresse';
import { supabase } from '../lib/supabase';
import { dbToParticipant, participantToDb, bilanToDb } from '../lib/mappers';

function hasAddress(p: Pick<Participant, 'adresseRue' | 'adresseVille'>): boolean {
  return Boolean(p.adresseRue?.trim() && p.adresseVille?.trim());
}

export function useParticipants() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const participantsRef = useRef(participants);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let cancelled = false;
    supabase
      .from('participants')
      .select('*, bilans(*), programmes(*)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement participants:', error); setLoading(false); return; }
        setParticipants((data ?? []).map(dbToParticipant));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function runGeocode(id: string, rue: string, cp: string, ville: string) {
    void geocodeAdresse(rue, cp, ville).then(async coords => {
      if (supabase) {
        const update = coords
          ? { coordonnees_lat: coords.lat, coordonnees_lng: coords.lng, coordonnees_geocodee_at: new Date().toISOString(), coordonnees_adresse_normalisee: coords.adresseNormalisee, geocode_failed: false }
          : { geocode_failed: true };
        await supabase.from('participants').update(update).eq('id', id);
      }
      setParticipants(prev =>
        prev.map(p =>
          p.id === id
            ? coords
              ? { ...p, geocodeFailed: false, coordonnees: { lat: coords.lat, lng: coords.lng, geocodeeAt: new Date().toISOString(), adresseNormalisee: coords.adresseNormalisee } }
              : { ...p, geocodeFailed: true }
            : p
        )
      );
    });
  }

  const addParticipant = useCallback(async (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => {
    const newP: Participant = { tags: [], ...data, id: uuidv4(), token: generateToken(), bilans: [] };
    if (supabase) {
      const { error } = await supabase.from('participants').insert(participantToDb(newP));
      if (error) { console.error('Erreur ajout participant:', error); return null; }
      if (hasAddress(newP)) runGeocode(newP.id, newP.adresseRue!, newP.adresseCodePostal ?? '', newP.adresseVille!);
    }
    setParticipants(prev => [newP, ...prev]);
    return newP;
  }, []);

  const updateParticipant = useCallback(async (id: string, data: Partial<Omit<Participant, 'id' | 'token'>>) => {
    const current = participantsRef.current.find(p => p.id === id);
    if (!current) return;
    const merged = { ...current, ...data };
    if (supabase) {
      const { error } = await supabase.from('participants').update(participantToDb(merged)).eq('id', id);
      if (error) { console.error('Erreur mise à jour participant:', error); return; }
      const addressChanged = 'adresseRue' in data || 'adresseVille' in data || 'adresseCodePostal' in data;
      if (addressChanged) {
        const rue = data.adresseRue ?? current.adresseRue ?? '';
        const cp  = data.adresseCodePostal ?? current.adresseCodePostal ?? '';
        const ville = data.adresseVille ?? current.adresseVille ?? '';
        if (rue.trim() && ville.trim()) runGeocode(id, rue, cp, ville);
      }
    }
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const geocodeParticipant = useCallback((id: string) => {
    const p = participantsRef.current.find(pp => pp.id === id);
    if (!p || !hasAddress(p)) return;
    runGeocode(id, p.adresseRue!, p.adresseCodePostal ?? '', p.adresseVille!);
  }, []);

  const deleteParticipant = useCallback(async (id: string) => {
    if (supabase) await supabase.from('participants').delete().eq('id', id);
    setParticipants(prev => prev.filter(p => p.id !== id));
  }, []);

  const addBilan = useCallback(async (participantId: string, bilan: Omit<Bilan, 'id'>) => {
    const newBilan: Bilan = { ...bilan, id: uuidv4() };
    if (supabase) {
      const { error } = await supabase.from('bilans').insert(bilanToDb(participantId, newBilan));
      if (error) { console.error('Erreur ajout bilan:', error); return newBilan; }
    }
    setParticipants(prev => prev.map(p =>
      p.id === participantId ? { ...p, bilans: [...p.bilans, newBilan] } : p
    ));
    return newBilan;
  }, []);

  const updateBilan = useCallback(async (participantId: string, bilanId: string, data: Partial<Bilan>) => {
    const current = participantsRef.current.find(p => p.id === participantId)?.bilans.find(b => b.id === bilanId);
    if (!current) return;
    const merged = { ...current, ...data };
    if (supabase) {
      await supabase.from('bilans').update(bilanToDb(participantId, merged)).eq('id', bilanId);
    }
    setParticipants(prev => prev.map(p =>
      p.id === participantId
        ? { ...p, bilans: p.bilans.map(b => b.id === bilanId ? { ...b, ...data } : b) }
        : p
    ));
  }, []);

  const getByToken = useCallback((token: string) => {
    return participants.find(p => p.token === token) ?? null;
  }, [participants]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(participants, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horizon-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [participants]);

  return {
    participants,
    loading,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    geocodeParticipant,
    addBilan,
    updateBilan,
    getByToken,
    exportJSON,
  };
}
