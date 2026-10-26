import { describe, it, expect } from 'vitest';
import type { CategorieExercice, Exercice } from '../types';
import { EXERCICES_BASE } from '../data/exercices';
import { positionDe } from '../data/exercicesMouvApa';
import {
  FILTRES_VIDES, filtrerExercices, correspondType, correspondPosition, correspondMateriel, correspondRecherche,
  nombreFiltresPanneau,
} from './filtresExercices';

const perso = (p: Partial<Exercice>): Exercice => ({
  id: 'perso-1', nom: 'Mon exercice', categorie: 'force', description: '', niveaux: { debutant: '', intermediaire: '', avance: '' },
  dureeEstimeeMinutes: 5, custom: true, ...p,
});

// Ancien filtre « Catégorie » → nouveau filtre « Type » équivalent.
const TYPE_DE_CATEGORIE: Record<CategorieExercice, Parameters<typeof correspondType>[1]> = {
  force: 'renforcement', equilibre: 'equilibre', mobilite: 'mobilite', souplesse: 'souplesse', endurance: 'cardio', memoire: 'cognitif',
};

describe('filtres de la bibliothèque d\'exercices', () => {
  it('sans filtre, tous les exercices sont affichés', () => {
    expect(filtrerExercices(EXERCICES_BASE, FILTRES_VIDES)).toHaveLength(EXERCICES_BASE.length);
  });

  it('le filtre Type ne perd aucun exercice de l\'ancien filtre Catégorie', () => {
    for (const [categorie, type] of Object.entries(TYPE_DE_CATEGORIE) as [CategorieExercice, typeof TYPE_DE_CATEGORIE.force][]) {
      const avant = EXERCICES_BASE.filter(ex => ex.categorie === categorie).map(ex => ex.id);
      const apres = new Set(filtrerExercices(EXERCICES_BASE, { ...FILTRES_VIDES, type }).map(ex => ex.id));
      expect(avant.filter(id => !apres.has(id)), `${categorie} → ${type}`).toEqual([]);
    }
  });

  it('un exercice personnel sans famille suit sa catégorie', () => {
    expect(correspondType(perso({ categorie: 'endurance' }), 'cardio')).toBe(true);
    expect(correspondType(perso({ categorie: 'endurance' }), 'renforcement')).toBe(false);
  });

  it('position : « assis ou debout » convient aux deux, fauteuil = assis, inconnue écartée', () => {
    expect(correspondPosition(perso({ positionRequise: 'tous' }), 'assis')).toBe(true);
    expect(correspondPosition(perso({ positionRequise: 'tous' }), 'debout')).toBe(true);
    expect(correspondPosition(perso({ positionRequise: 'tous' }), 'couche')).toBe(false);
    expect(correspondPosition(perso({ positionRequise: 'fauteuil' }), 'assis')).toBe(true);
    expect(correspondPosition(perso({ positionRequise: undefined }), 'assis')).toBe(false);
  });

  it('« Assis » ne remonte aucun exercice debout ni au sol', () => {
    const assis = filtrerExercices(EXERCICES_BASE, { ...FILTRES_VIDES, position: 'assis' });
    expect(assis.length).toBeGreaterThan(20);
    expect(assis.filter(ex => ['debout', 'couche'].includes(positionDe(ex) ?? ''))).toEqual([]);
  });

  it('matériel : « sans matériel » se fie au texte quand le champ structuré manque', () => {
    expect(correspondMateriel(perso({ materielNecessaire: 'Aucun' }), 'sans')).toBe(true);
    expect(correspondMateriel(perso({ materielNecessaire: 'Élastique' }), 'sans')).toBe(false);
    expect(correspondMateriel(perso({ materiels: ['chaise'] }), 'sans')).toBe(true);
    expect(correspondMateriel(perso({ materiels: ['elastique'] }), 'elastique')).toBe(true);
  });

  it('recherche sans accents ni casse', () => {
    expect(correspondRecherche(perso({ nom: 'Équilibre unipodal' }), 'equilibre')).toBe(true);
    expect(correspondRecherche(perso({ nom: 'Pont fessier' }), 'PONT')).toBe(true);
    expect(correspondRecherche(perso({ nom: 'Pont fessier', objectif: 'Renforcer les épaules' }), 'epaule')).toBe(true);
    expect(correspondRecherche(perso({ nom: 'Pont fessier' }), 'squat')).toBe(false);
  });

  it('onglet « Mes exercices » : seulement les exercices personnels', () => {
    const liste = [...EXERCICES_BASE, perso({})];
    expect(filtrerExercices(liste, { ...FILTRES_VIDES, origine: 'perso' }).map(ex => ex.id)).toEqual(['perso-1']);
  });

  it('badge du bouton Filtres', () => {
    expect(nombreFiltresPanneau(FILTRES_VIDES, false)).toBe(0);
    expect(nombreFiltresPanneau({ ...FILTRES_VIDES, type: 'pilates', materiel: 'sans' }, true)).toBe(3);
  });
});
