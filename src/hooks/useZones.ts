import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ZoneGeographique, JourSemaine, Participant } from '../types';
import { COULEURS_ZONES } from '../types';
import { kMeans } from '../utils/kmeans';
import { supabase } from '../lib/supabase';
import { dbToZone, zoneToDb } from '../lib/mappers';

export function useZones() {
  const [zones, setZones] = useState<ZoneGeographique[]>([]);

  useEffect(() => {
    if (!supabase) return;
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

    const participantById = new Map(participants.map(p => [p.id, p]));

    // Ville dominante de chaque cluster (la plus fréquente parmi les adresseVille)
    const clusterData = clusters
      .filter(cl => cl.points.length > 0)
      .map((cl, i) => {
        const villes = cl.points
          .map(pt => participantById.get(pt.id)?.adresseVille?.trim())
          .filter((v): v is string => !!v);
        const freq = new Map<string, number>();
        for (const v of villes) freq.set(v, (freq.get(v) ?? 0) + 1);
        const villeDominante = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return { cl, i, villeDominante, centroide: cl.centroide };
      });

    // Grouper par ville pour détecter les homonymes → point cardinal
    const byVille = new Map<string, typeof clusterData>();
    for (const d of clusterData) {
      const key = d.villeDominante ?? '';
      const g = byVille.get(key) ?? [];
      g.push(d);
      byVille.set(key, g);
    }

    // Angle depuis le nord (0°=N, 90°=E) → direction en français
    function cardinal(dlat: number, dlng: number): string {
      const angle = Math.atan2(dlng, dlat) * 180 / Math.PI;
      const dirs = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
      return dirs[Math.round(((angle % 360) + 360) % 360 / 45) % 8];
    }

    const nouvelles: ZoneGeographique[] = clusterData.map((d, i) => {
      let nom: string;
      if (!d.villeDominante) {
        nom = `Zone ${i + 1}`;
      } else {
        const groupe = byVille.get(d.villeDominante)!;
        if (groupe.length === 1) {
          nom = `Zone ${d.villeDominante}`;
        } else {
          // Centroïde du groupe (moyenne des centroïdes de la même ville)
          const gcLat = groupe.reduce((s, g) => s + g.centroide.lat, 0) / groupe.length;
          const gcLng = groupe.reduce((s, g) => s + g.centroide.lng, 0) / groupe.length;
          nom = `Zone ${d.villeDominante} ${cardinal(d.centroide.lat - gcLat, d.centroide.lng - gcLng)}`;
        }
      }
      return {
        id: uuidv4(),
        nom,
        couleur: COULEURS_ZONES[i % COULEURS_ZONES.length],
        participantIds: d.cl.points.map(p => p.id),
        centroide: d.cl.centroide,
        joursAssignes: [],
      };
    });

    if (supabase) {
      await supabase.from('zones_geographiques').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (nouvelles.length > 0) {
        await supabase.from('zones_geographiques').insert(nouvelles.map(zoneToDb));
      }
    }
    setZones(nouvelles);
    return nouvelles;
  }

  async function renommerZone(id: string, nom: string) {
    if (supabase) await supabase.from('zones_geographiques').update({ nom }).eq('id', id);
    setZones(prev => prev.map(z => z.id === id ? { ...z, nom } : z));
  }

  async function assignerJours(id: string, jours: JourSemaine[]) {
    if (supabase) await supabase.from('zones_geographiques').update({ jours_assignes: jours }).eq('id', id);
    setZones(prev => prev.map(z => z.id === id ? { ...z, joursAssignes: jours } : z));
  }

  async function deplacerPatient(participantId: string, versZoneId: string) {
    const newZones = zones.map(z => ({
      ...z,
      participantIds: z.id === versZoneId
        ? [...z.participantIds.filter(id => id !== participantId), participantId]
        : z.participantIds.filter(id => id !== participantId),
    }));

    if (supabase) {
      for (const z of newZones) {
        await supabase.from('zones_geographiques').update({ participant_ids: z.participantIds }).eq('id', z.id);
      }
    }
    setZones(newZones);
  }

  function zoneDePatient(participantId: string): ZoneGeographique | undefined {
    return zones.find(z => z.participantIds.includes(participantId));
  }

  return { zones, calculerZones, renommerZone, assignerJours, deplacerPatient, zoneDePatient };
}
