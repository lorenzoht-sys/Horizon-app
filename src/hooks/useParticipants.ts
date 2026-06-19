import { useState, useEffect, useCallback, useRef } from 'react';
import type { Participant, Bilan } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { generateToken } from '../utils/generateToken';
import { genererCodeAcces } from '../utils/codeAcces';
import { geocodeAdresse } from '../utils/geocodeAdresse';
import { supabase } from '../lib/supabase';
import { dbToParticipant, participantToDb, bilanToDb } from '../lib/mappers';

const DEMO_PATIENTS: Participant[] = [
  {
    id: 'demo-1', token: 'demo-tok-1',
    prenom: 'Martine', nom: 'Lefebvre',
    dateNaissance: '1948-03-12', dateCreation: '2026-01-08',
    email: 'martine.lefebvre@gmail.com', telephone: '06 12 34 56 78',
    adresseVille: 'Nantes', taille: 162, poids: 68,
    tags: [], testsActifs: [],
    bilans: [{
      id: 'b-demo-1', date: '2026-03-15', type: 'initial', trimestre: 1,
      equilibre: { droite: 18, gauche: 14 }, chairStand30: 12,
      handGrip: { droite: 16, gauche: 14 }, tug3m: 11.2,
      souplesse: { methode: 'assis', valeur: -4 },
      tm6: { distanceMetres: 380, fcAvant: 72, fcApres: 108, fc2min: 88, spo2Avant: 98, spo2Apres: 96, spo22min: 97, borgRPE: 13, dureeMode: 'fixe', dureeCibleSecondes: 360, dureeReelleSecondes: 360, nbPauses: 0, dureePausesSecondes: 0, notesPauses: '' },
      memoire: { scoreImmediat: 8, scoreDiffere: 6 },
      notesProfessionnelles: '', objectifsSuivants: '', pointsVigilance: '', messageClient: '',
    }],
  },
  {
    id: 'demo-2', token: 'demo-tok-2',
    prenom: 'Jean-Pierre', nom: 'Morel',
    dateNaissance: '1955-07-22', dateCreation: '2026-01-15',
    email: 'jp.morel@orange.fr', telephone: '06 23 45 67 89',
    adresseVille: 'Saint-Nazaire',
    tags: [], testsActifs: [], bilans: [],
  },
  {
    id: 'demo-3', token: 'demo-tok-3',
    prenom: 'Sophie', nom: 'Bernard',
    dateNaissance: '1978-11-05', dateCreation: '2026-02-03',
    email: 'sophie.bernard@gmail.com', telephone: '06 34 56 78 90',
    adresseVille: 'Nantes', taille: 168, poids: 62,
    tags: [], testsActifs: [],
    bilans: [{
      id: 'b-demo-3', date: '2026-04-10', type: 'initial', trimestre: 1,
      equilibre: { droite: 28, gauche: 24 }, chairStand30: 18,
      handGrip: { droite: 22, gauche: 20 }, tug3m: 7.8,
      souplesse: { methode: 'assis', valeur: 6 },
      tm6: { distanceMetres: 520, fcAvant: 68, fcApres: 130, fc2min: 95, spo2Avant: 99, spo2Apres: 97, spo22min: 98, borgRPE: 11, dureeMode: 'fixe', dureeCibleSecondes: 360, dureeReelleSecondes: 360, nbPauses: 0, dureePausesSecondes: 0, notesPauses: '' },
      memoire: { scoreImmediat: 14, scoreDiffere: 12 },
      notesProfessionnelles: '', objectifsSuivants: '', pointsVigilance: '', messageClient: '',
    }],
  },
  {
    id: 'demo-4', token: 'demo-tok-4',
    prenom: 'Robert', nom: 'Durand',
    dateNaissance: '1942-02-18', dateCreation: '2026-02-20',
    telephone: '06 45 67 89 01', adresseVille: 'La Baule',
    taille: 172, poids: 78,
    tags: [], testsActifs: [], bilans: [],
  },
  {
    id: 'demo-5', token: 'demo-tok-5',
    prenom: 'Isabelle', nom: 'Martin',
    dateNaissance: '1960-09-30', dateCreation: '2026-03-01',
    email: 'i.martin@wanadoo.fr', telephone: '06 56 78 90 12',
    adresseVille: 'Rezé',
    tags: [], testsActifs: [],
    bilans: [{
      id: 'b-demo-5', date: '2026-05-02', type: 'initial', trimestre: 1,
      equilibre: { droite: 22, gauche: 20 }, chairStand30: 10,
      handGrip: { droite: 18, gauche: 16 }, tug3m: 13.5,
      souplesse: { methode: 'assis', valeur: -8 },
      tm6: { distanceMetres: 320, fcAvant: 78, fcApres: 118, fc2min: 92, spo2Avant: 97, spo2Apres: 94, spo22min: 95, borgRPE: 15, dureeMode: 'fixe', dureeCibleSecondes: 360, dureeReelleSecondes: 360, nbPauses: 0, dureePausesSecondes: 0, notesPauses: '' },
      memoire: { scoreImmediat: 9, scoreDiffere: 7 },
      notesProfessionnelles: '', objectifsSuivants: '', pointsVigilance: '', messageClient: '',
    }],
  },
];

function hasAddress(p: Pick<Participant, 'adresseRue' | 'adresseVille'>): boolean {
  return Boolean(p.adresseRue?.trim() && p.adresseVille?.trim());
}

// Nombre d'essais en cas de collision improbable sur code_acces (espace de
// 31^8 codes possibles — voir src/utils/codeAcces.ts).
const MAX_TENTATIVES_CODE_ACCES = 5;

export function useParticipants() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const participantsRef = useRef(participants);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    if (!supabase) {
      try {
        const s = localStorage.getItem('horizon_local_patients');
        const parsed: Participant[] = s ? JSON.parse(s) : [];
        if (parsed.length === 0) {
          const demo = DEMO_PATIENTS;
          localStorage.setItem('horizon_local_patients', JSON.stringify(demo));
          setParticipants(demo);
        } else {
          setParticipants(parsed);
        }
      } catch {}
      setLoading(false); return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('participants')
        .select('*, bilans(*), programmes(*)')
        .eq('praticien_id', user.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) { console.error('Erreur chargement participants:', error); setLoading(false); return; }
      setParticipants((data ?? []).map(dbToParticipant));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function runGeocode(id: string, rue: string, cp: string, ville: string) {
    void geocodeAdresse(rue, cp, ville).then(async coords => {
      if (supabase && coords) {
        await supabase.from('participants')
          .update({ coordonnees_lat: coords.lat, coordonnees_lng: coords.lng })
          .eq('id', id);
      }
      setParticipants(prev =>
        prev.map(p =>
          p.id === id
            ? coords
              ? { ...p, geocodeFailed: false, coordonnees: { lat: coords.lat, lng: coords.lng, geocodeeAt: '' } }
              : { ...p, geocodeFailed: true }
            : p
        )
      );
    });
  }

  const addParticipant = useCallback(async (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => {
    const newP: Participant = { tags: [], ...data, id: uuidv4(), token: generateToken(), codeAcces: genererCodeAcces(), bilans: [] };
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      for (let tentative = 0; tentative < MAX_TENTATIVES_CODE_ACCES; tentative++) {
        const dbRow = { ...participantToDb(newP), praticien_id: user?.id ?? null };
        const { error } = await supabase.from('participants').insert(dbRow);
        if (!error) break;
        const collisionCodeAcces = error.code === '23505' && error.message.includes('code_acces');
        if (!collisionCodeAcces || tentative === MAX_TENTATIVES_CODE_ACCES - 1) {
          console.error('Erreur ajout participant:', error); throw error;
        }
        newP.codeAcces = genererCodeAcces();
      }
      if (hasAddress(newP)) runGeocode(newP.id, newP.adresseRue!, newP.adresseCodePostal ?? '', newP.adresseVille!);
    }
    setParticipants(prev => {
      const next = [newP, ...prev];
      if (!supabase) try { localStorage.setItem('horizon_local_patients', JSON.stringify(next)); } catch {}
      return next;
    });
    return newP;
  }, []);

  const updateParticipant = useCallback(async (id: string, data: Partial<Omit<Participant, 'id' | 'token'>>) => {
    const current = participantsRef.current.find(p => p.id === id);
    if (!current) return;
    const merged = { ...current, ...data };
    if (supabase) {
      const { error } = await supabase.from('participants').update(participantToDb(merged)).eq('id', id);
      if (error) {
        console.error('Erreur mise à jour participant:', error);
        throw new Error(error.message);
      }
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
      if (error) {
        console.error('Erreur ajout bilan:', error);
        throw new Error(error.message);
      }
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
      const { error } = await supabase.from('bilans').update(bilanToDb(participantId, merged)).eq('id', bilanId);
      if (error) {
        console.error('Erreur mise à jour bilan:', error);
        throw new Error(error.message);
      }
    }
    setParticipants(prev => prev.map(p =>
      p.id === participantId
        ? { ...p, bilans: p.bilans.map(b => b.id === bilanId ? { ...b, ...data } : b) }
        : p
    ));
  }, []);

  const deleteBilan = useCallback(async (participantId: string, bilanId: string) => {
    if (supabase) {
      await supabase.from('bilans').delete().eq('id', bilanId);
    }
    setParticipants(prev => prev.map(p =>
      p.id === participantId
        ? { ...p, bilans: p.bilans.filter(b => b.id !== bilanId) }
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
    deleteBilan,
    getByToken,
    exportJSON,
  };
}
