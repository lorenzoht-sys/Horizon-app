import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ZoneGeographique, JourSemaine, Participant } from '../types';
import { COULEURS_ZONES } from '../types';
import { kMeans } from '../utils/kmeans';
import { DEMO_ZONES } from '../data/demoZones';

const STORAGE_KEY = 'mouvtrack_zones';

function load(): ZoneGeographique[] {
  const cleared = !!localStorage.getItem('mouvtrack_demo_cleared');
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (cleared) return [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_ZONES));
      return DEMO_ZONES;
    }
    return JSON.parse(raw);
  } catch { return cleared ? [] : DEMO_ZONES; }
}

export function useZones() {
  const [zones, setZones] = useState<ZoneGeographique[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
  }, [zones]);

  function calculerZones(participants: Participant[], k: number): ZoneGeographique[] {
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

    setZones(nouvelles);
    return nouvelles;
  }

  function renommerZone(id: string, nom: string) {
    setZones(prev => prev.map(z => z.id === id ? { ...z, nom } : z));
  }

  function assignerJours(id: string, jours: JourSemaine[]) {
    setZones(prev => prev.map(z => z.id === id ? { ...z, joursAssignes: jours } : z));
  }

  function deplacerPatient(participantId: string, versZoneId: string) {
    setZones(prev => prev.map(z => ({
      ...z,
      participantIds: z.id === versZoneId
        ? [...z.participantIds.filter(id => id !== participantId), participantId]
        : z.participantIds.filter(id => id !== participantId),
    })));
  }

  function zoneDePatient(participantId: string): ZoneGeographique | undefined {
    return zones.find(z => z.participantIds.includes(participantId));
  }

  return { zones, calculerZones, renommerZone, assignerJours, deplacerPatient, zoneDePatient };
}
