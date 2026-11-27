import { useState, useEffect, useCallback, useRef } from 'react';
import type { Participant, Bilan } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { generateToken } from '../utils/generateToken';
import { genererCodeAcces } from '../utils/codeAcces';
import { geocodeAdresse } from '../utils/geocodeAdresse';
import { supabase } from '../lib/supabase';
import { utilisateurCourant } from '../lib/session';
import { dbToParticipant, participantToDb, bilanToDb } from '../lib/mappers';
import { separerParArchivage } from '../lib/archivage';
import { messageSuppressionBeneficiaire } from '../lib/suppressionBeneficiaire';

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
    let cancelled = false;
    (async () => {
      const user = await utilisateurCourant();
      if (cancelled) return;
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('participants')
        .select('*, bilans(*), programmes(*)')
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
      if (coords) {
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
    const user = await utilisateurCourant();
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
    setParticipants(prev => {
      const next = [newP, ...prev];
      return next;
    });
    return newP;
  }, []);

  const updateParticipant = useCallback(async (id: string, data: Partial<Omit<Participant, 'id' | 'token'>>) => {
    const current = participantsRef.current.find(p => p.id === id);
    if (!current) return;
    const merged = { ...current, ...data };
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
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, []);

  const geocodeParticipant = useCallback((id: string) => {
    const p = participantsRef.current.find(pp => pp.id === id);
    if (!p || !hasAddress(p)) return;
    runGeocode(id, p.adresseRue!, p.adresseCodePostal ?? '', p.adresseVille!);
  }, []);

  // Ne retire le bénéficiaire de la liste QUE si la base a réellement supprimé la ligne. Avant le
  // 2026-10-20, l'erreur était ignorée : une suppression refusée (historique financier) faisait quand même
  // disparaître la fiche jusqu'au rechargement. `select('id')` : sans lui, une suppression qui ne touche
  // aucune ligne (RLS) passerait pour un succès.
  const deleteParticipant = useCallback(async (id: string): Promise<{ ok: true } | { erreur: string }> => {
    const { data, error } = await supabase.from('participants').delete().eq('id', id).select('id');
    if (error) return { erreur: messageSuppressionBeneficiaire(error) };
    if (!data || data.length === 0) return { erreur: 'Suppression impossible : ce bénéficiaire n\'a pas été trouvé.' };
    setParticipants(prev => prev.filter(p => p.id !== id));
    return { ok: true };
  }, []);

  const addBilan = useCallback(async (participantId: string, bilan: Omit<Bilan, 'id'>) => {
    const newBilan: Bilan = { ...bilan, id: uuidv4() };
    const { error } = await supabase.from('bilans').insert(bilanToDb(participantId, newBilan));
    if (error) {
      console.error('Erreur ajout bilan:', error);
      throw new Error(error.message);
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
    const { error } = await supabase.from('bilans').update(bilanToDb(participantId, merged)).eq('id', bilanId);
    if (error) {
      console.error('Erreur mise à jour bilan:', error);
      throw new Error(error.message);
    }
    setParticipants(prev => prev.map(p =>
      p.id === participantId
        ? { ...p, bilans: p.bilans.map(b => b.id === bilanId ? { ...b, ...data } : b) }
        : p
    ));
  }, []);

  const deleteBilan = useCallback(async (participantId: string, bilanId: string) => {
    await supabase.from('bilans').delete().eq('id', bilanId);
    setParticipants(prev => prev.map(p =>
      p.id === participantId
        ? { ...p, bilans: p.bilans.filter(b => b.id !== bilanId) }
        : p
    ));
  }, []);

  const getByToken = useCallback((token: string) => {
    return participants.find(p => p.token === token) ?? null;
  }, [participants]);

  // Archivage : bascule manuelle, distincte du statut des contrats (voir
  // Participant.archive, types/index.ts). date_archivage posée/vidée avec
  // le flag pour tracer depuis quand — jamais dérivée de l'absence de
  // contrat actif ailleurs dans le code.
  const archiverParticipant = useCallback(async (id: string, archive: boolean) => {
    await updateParticipant(id, {
      archive,
      dateArchivage: archive ? new Date().toISOString().split('T')[0] : undefined,
    });
  }, [updateParticipant]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(participants, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horizon-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [participants]);

  // Vue par défaut pour les écrans du quotidien (tournée, dashboard,
  // sélecteurs) : exclut les bénéficiaires archivés. `participants` reste
  // volontairement complet et inchangé — les écrans de stats/facturation
  // (StatsPage.tsx, DossierPDF.tsx, useFactures.ts) doivent continuer à
  // tout compter, archivage ou non.
  const { actifs: participantsActifs, archives: participantsArchives } = separerParArchivage(participants);

  return {
    participants,
    participantsActifs,
    participantsArchives,
    loading,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    archiverParticipant,
    geocodeParticipant,
    addBilan,
    updateBilan,
    deleteBilan,
    getByToken,
    exportJSON,
  };
}
