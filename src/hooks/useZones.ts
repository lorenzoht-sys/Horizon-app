import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ZoneGeographique, JourSemaine, Participant } from '../types';
import { COULEURS_ZONES } from '../types';
import { kMeans } from '../utils/kmeans';
import { supabase } from '../lib/supabase';
import { dbToZone, zoneToDb } from '../lib/mappers';
import { DEMO_ZONES } from '../data/demoZones';

const LS_KEY = 'mouvtrack_zones';

function loadFromLocal(): ZoneGeographique[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : DEMO_ZONES;
  } catch {
    return DEMO_ZONES;
  }
}

function saveToLocal(zones: ZoneGeographique[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(zones));
}

export function useZones() {
  const [zones, setZones] = useState<ZoneGeographique[]>([]);

  useEffect(() => {
    if (!supabase) {
      setZones(loadFromLocal());
      return;
    }
    let cancelled = false;
    supabase
      .from('zones_geographiques')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement zones:', error); return; }
        setZones((data ?? []).map(dbToZone));
      });
    return () => { cancelled = true; };
  }, []);

  async function calculerZones(participants: Participant[], k: number): Promise<ZoneGeographique[]> {
    const points = participants
      .filter(p => p.coordonnees && !p.geocodeFailed)
      .map(p => ({ id: p.id, lat: p.coordonnees!.lat, lng: p.coordonnees!.lng }));

    const clusters = kMeans(points, k);

    const nouvelles: ZoneGeographique[] = clusters
      .filter(cl => cl.points.length > 0)
      .map((cl, i) => ({
        id: uuidv4(),
        nom: `Zone ${i + 1}`,
        couleur: COULEURS_ZONES[i % COULEURS_ZONES.length],
        participantIds: cl.points.map(p => p.id),
        centroide: cl.centroide,
        joursAssignes: [],
      }));

    if (!supabase) {
      saveToLocal(nouvelles);
      setZones(nouvelles);
      return nouvelles;
    }

    await supabase.from('zones_geographiques').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (nouvelles.length > 0) {
      await supabase.from('zones_geographiques').insert(nouvelles.map(zoneToDb));
    }
    setZones(nouvelles);
    return nouvelles;
  }

  async function renommerZone(id: string, nom: string) {
    if (!supabase) {
      setZones(prev => {
        const updated = prev.map(z => z.id === id ? { ...z, nom } : z);
        saveToLocal(updated);
        return updated;
      });
      return;
    }
    await supabase.from('zones_geographiques').update({ nom }).eq('id', id);
    setZones(prev => prev.map(z => z.id === id ? { ...z, nom } : z));
  }

  async function assignerJours(id: string, jours: JourSemaine[]) {
    if (!supabase) {
      setZones(prev => {
        const updated = prev.map(z => z.id === id ? { ...z, joursAssignes: jours } : z);
        saveToLocal(updated);
        return updated;
      });
      return;
    }
    await supabase.from('zones_geographiques').update({ jours_assignes: jours }).eq('id', id);
    setZones(prev => prev.map(z => z.id === id ? { ...z, joursAssignes: jours } : z));
  }

  async function deplacerPatient(participantId: string, versZoneId: string) {
    const newZones = zones.map(z => ({
      ...z,
      participantIds: z.id === versZoneId
        ? [...z.participantIds.filter(id => id !== participantId), participantId]
        : z.participantIds.filter(id => id !== participantId),
    }));

    if (!supabase) {
      saveToLocal(newZones);
      setZones(newZones);
      return;
    }

    for (const z of newZones) {
      await supabase.from('zones_geographiques').update({ participant_ids: z.participantIds }).eq('id', z.id);
    }
    setZones(newZones);
  }

  function zoneDePatient(participantId: string): ZoneGeographique | undefined {
    return zones.find(z => z.participantIds.includes(participantId));
  }

  return { zones, calculerZones, renommerZone, assignerJours, deplacerPatient, zoneDePatient };
}
