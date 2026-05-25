import { useState, useEffect, useCallback, useRef } from 'react';
import type { Participant, Bilan, TagPatient } from '../types';
import { DEMO_PARTICIPANTS } from '../data/demo';
import { v4 as uuidv4 } from 'uuid';
import { generateToken } from '../utils/generateToken';
import { geocodeAdresse } from '../utils/geocodeAdresse';

const STORAGE_KEY = 'mouvtrack_participants';

// Migration profil → tags (ancien système → nouveau)
const PROFIL_TO_TAG: Record<string, TagPatient> = {
  senior_chutes: 'senior',
  post_operatoire: 'post_op',
  pathologie_chronique: 'chronique',
  adulte_blessure: 'adulte_blessure',
};

function migrateParticipant(p: Participant): Participant {
  let result = p;

  // Migration profil → tags
  if (result.tags === undefined) {
    const tag = result.profil ? PROFIL_TO_TAG[result.profil] : undefined;
    result = { ...result, tags: tag ? [tag] : [] };
  }

  // Migration disponibilites — recopier depuis demo si le champ est absent
  if (!result.disponibilites) {
    const demoRef = DEMO_PARTICIPANTS.find(d => d.id === result.id);
    if (demoRef?.disponibilites) {
      result = { ...result, disponibilites: demoRef.disponibilites };
    }
  }

  return result;
}

function load(): Participant[] {
  const cleared = !!localStorage.getItem('mouvtrack_demo_cleared');
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cleared ? [] : DEMO_PARTICIPANTS.map(migrateParticipant);
    const stored: Participant[] = JSON.parse(raw);
    const migrated = stored.map(migrateParticipant);
    if (cleared) return migrated;
    const ids = new Set(migrated.map(p => p.id));
    const missing = DEMO_PARTICIPANTS.filter(p => !ids.has(p.id)).map(migrateParticipant);
    return missing.length > 0 ? [...missing, ...migrated] : migrated;
  } catch {
    return cleared ? [] : DEMO_PARTICIPANTS.map(migrateParticipant);
  }
}

function save(participants: Participant[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(participants));
}

function hasAddress(p: Pick<Participant, 'adresseRue' | 'adresseVille'>): boolean {
  return Boolean(p.adresseRue?.trim() && p.adresseVille?.trim());
}

export function useParticipants() {
  const [participants, setParticipants] = useState<Participant[]>(load);
  const participantsRef = useRef(participants);

  useEffect(() => {
    participantsRef.current = participants;
    save(participants);
  }, [participants]);

  // Géocode un participant et met à jour ses coordonnées
  function runGeocode(id: string, rue: string, cp: string, ville: string) {
    void geocodeAdresse(rue, cp, ville).then(coords => {
      if (coords) {
        setParticipants(prev => prev.map(p =>
          p.id === id
            ? { ...p, geocodeFailed: false, coordonnees: { lat: coords.lat, lng: coords.lng, geocodeeAt: new Date().toISOString(), adresseNormalisee: coords.adresseNormalisee } }
            : p
        ));
      } else {
        setParticipants(prev => prev.map(p =>
          p.id === id ? { ...p, geocodeFailed: true } : p
        ));
      }
    });
  }

  const addParticipant = useCallback((data: Omit<Participant, 'id' | 'token' | 'bilans'>) => {
    const newP: Participant = { tags: [], ...data, id: uuidv4(), token: generateToken(), bilans: [] };
    setParticipants(prev => [newP, ...prev]);
    if (hasAddress(newP)) {
      runGeocode(newP.id, newP.adresseRue!, newP.adresseCodePostal ?? '', newP.adresseVille!);
    }
    return newP;
  }, []);

  const updateParticipant = useCallback((id: string, data: Partial<Omit<Participant, 'id' | 'token'>>) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    // Re-géocoder si l'adresse a changé
    const addressChanged = 'adresseRue' in data || 'adresseVille' in data || 'adresseCodePostal' in data;
    if (addressChanged) {
      const current = participantsRef.current.find(p => p.id === id);
      const rue = data.adresseRue ?? current?.adresseRue ?? '';
      const cp = data.adresseCodePostal ?? current?.adresseCodePostal ?? '';
      const ville = data.adresseVille ?? current?.adresseVille ?? '';
      if (rue.trim() && ville.trim()) {
        runGeocode(id, rue, cp, ville);
      }
    }
  }, []);

  // Bouton "Recalculer la position" dans la fiche patient
  const geocodeParticipant = useCallback((id: string) => {
    const p = participantsRef.current.find(pp => pp.id === id);
    if (!p || !hasAddress(p)) return;
    runGeocode(id, p.adresseRue!, p.adresseCodePostal ?? '', p.adresseVille!);
  }, []);

  const deleteParticipant = useCallback((id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  }, []);

  const addBilan = useCallback((participantId: string, bilan: Omit<Bilan, 'id'>) => {
    const newBilan: Bilan = { ...bilan, id: uuidv4() };
    setParticipants(prev => {
      const updated = prev.map(p => p.id === participantId ? { ...p, bilans: [...p.bilans, newBilan] } : p);
      save(updated); // Sauvegarde synchrone avant le démontage potentiel du composant
      return updated;
    });
    return newBilan;
  }, []);

  const updateBilan = useCallback((participantId: string, bilanId: string, data: Partial<Bilan>) => {
    setParticipants(prev =>
      prev.map(p =>
        p.id === participantId
          ? { ...p, bilans: p.bilans.map(b => b.id === bilanId ? { ...b, ...data } : b) }
          : p
      )
    );
  }, []);

  const getByToken = useCallback((token: string) => {
    return participants.find(p => p.token === token) ?? null;
  }, [participants]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(participants, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mouvtrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [participants]);

  const importJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) setParticipants(data);
      } catch {
        console.error('Fichier JSON invalide');
      }
    };
    reader.readAsText(file);
  }, []);

  return {
    participants,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    geocodeParticipant,
    addBilan,
    updateBilan,
    getByToken,
    exportJSON,
    importJSON,
  };
}
