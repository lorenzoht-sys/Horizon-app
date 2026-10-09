import { useState, useEffect } from 'react';

// Objectifs de CA du tableau de bord « Mes stats », conservés dans le navigateur (localStorage).
//
// Le CA lui-même n'est PLUS stocké ici : l'ancienne saisie mensuelle (`caParMois`) a été supprimée le
// 2026-10-09. C'était une saisie locale, non synchronisée, sans lien avec les bénéficiaires. Le CA vient
// maintenant de la facturation (factures validées, HT) et des saisies de CA externe (page /factures/ca),
// voir useCaAnneeEnCours (src/hooks/useChiffreAffaires.ts). Aucune migration de l'ancienne valeur : une
// clé `caParMois` éventuellement présente dans le navigateur est ignorée, puis effacée à la prochaine
// sauvegarde.

export interface StatsPro {
  objectifMensuel: number;
  objectifAnnuel: number;
}

const STORAGE_KEY = 'stats_pro';

const DEFAULT: StatsPro = {
  objectifMensuel: 2000,
  objectifAnnuel: 20000,
};

function load(): StatsPro {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return {
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(statsPro));
    } catch { /* stockage indisponible : les objectifs ne sont simplement pas conservés */ }
  }, [statsPro]);

  function sauvegarder(data: StatsPro) {
    setStatsPro(data);
  }

  return { statsPro, sauvegarder };
}
