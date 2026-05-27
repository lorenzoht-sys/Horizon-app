import { useState, useEffect } from 'react';

export interface StatsPro {
  caParMois: Record<string, number>;   // "2026-01": 1350
  objectifMensuel: number;
  objectifAnnuel: number;
}

const STORAGE_KEY = 'stats_pro';

const DEFAULT: StatsPro = {
  caParMois: {},
  objectifMensuel: 2000,
  objectifAnnuel: 20000,
};

function load(): StatsPro {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return {
      caParMois:
        parsed?.caParMois !== null &&
        typeof parsed?.caParMois === 'object' &&
        !Array.isArray(parsed?.caParMois)
          ? parsed.caParMois
          : {},
      objectifMensuel:
        typeof parsed?.objectifMensuel === 'number'
          ? parsed.objectifMensuel
          : DEFAULT.objectifMensuel,
      objectifAnnuel:
        typeof parsed?.objectifAnnuel === 'number'
          ? parsed.objectifAnnuel
          : DEFAULT.objectifAnnuel,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function useStatsPro() {
  const [statsPro, setStatsPro] = useState<StatsPro>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statsPro));
  }, [statsPro]);

  function mettreAJourCA(moisKey: string, montant: number) {
    setStatsPro(prev => ({
      ...prev,
      caParMois: { ...prev.caParMois, [moisKey]: montant },
    }));
  }

  function sauvegarder(data: StatsPro) {
    setStatsPro(data);
  }

  function getCAMoisActuel(): number {
    const key = new Date().toISOString().slice(0, 7);
    return statsPro.caParMois[key] ?? 0;
  }

  function getCAAnneActuelle(): number {
    const annee = new Date().getFullYear().toString();
    return Object.entries(statsPro.caParMois)
      .filter(([k]) => k.startsWith(annee))
      .reduce((sum, [, v]) => sum + v, 0);
  }

  return { statsPro, mettreAJourCA, sauvegarder, getCAMoisActuel, getCAAnneActuelle };
}
