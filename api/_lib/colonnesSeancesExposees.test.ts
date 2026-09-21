import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { COLONNES_SEANCE_EXPOSEE } from './colonnesSeancesExposees.js';

const dossierApi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('colonnes de seances exposées au bénéficiaire et au portail structure', () => {
  const colonnes = COLONNES_SEANCE_EXPOSEE.split(',').map(c => c.trim());

  it('ne contient aucune donnée interne au praticien', () => {
    for (const interdite of ['notes', 'motif_annulation', 'motif_annulation_detail']) {
      expect(colonnes, `« ${interdite} » ne doit jamais quitter le praticien`).not.toContain(interdite);
    }
  });

  it('garde les colonnes dont les écrans ont besoin', () => {
    // Filet contre un retrait trop large : le portail structure et l'espace
    // patient lisent ces colonnes (date, heure, statut, type…).
    for (const attendue of ['id', 'participant_id', 'date', 'heure_debut', 'heure_fin', 'duree_minutes', 'type', 'statut']) {
      expect(colonnes).toContain(attendue);
    }
  });

  // Ces deux routes lisent des données de tiers avec service_role (RLS
  // contournée) : rien ne rattrape une colonne de trop après coup. On vérifie
  // donc la SOURCE, pour qu'un select('seances') recopié à la main — et qui
  // réintroduirait `notes` — fasse échouer la CI.
  it.each(['patient/me.ts', 'structure/data.ts'])('api/%s utilise la liste commune, sans select en clair', (fichier) => {
    const source = readFileSync(path.join(dossierApi, fichier), 'utf-8');
    const appel = /from\('seances'\)\s*\.select\(([^)]*)\)/s.exec(source);
    expect(appel, `select sur seances introuvable dans ${fichier}`).not.toBeNull();
    expect(appel![1].trim()).toBe('COLONNES_SEANCE_EXPOSEE');
  });
});
