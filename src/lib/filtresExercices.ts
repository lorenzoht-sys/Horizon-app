import type { Exercice, FamilleExercice, MaterielExercice } from '../types';
import { FAMILLES_PAR_CATEGORIE, famillesDe, positionDe } from '../data/exercicesMouvApa';

// Filtres de la bibliothèque d'exercices (refonte du 2026-10-26), sortis de ExercicesPage pour être
// testés. Avant la refonte, la page empilait deux classements concurrents (« Catégorie » historique et
// « Famille » Mouv'APA) et deux filtres de position (l'un visible seulement avec un profil). Il n'en
// reste qu'un de chaque :
//   - Type : un exercice correspond s'il porte la famille OU si sa catégorie historique y mène
//     (FAMILLES_PAR_CATEGORIE). « Renforcement » couvre donc toujours tout l'ancien filtre « Force » ;
//     rien ne disparaît d'un filtre par rapport à avant.
//   - Position : position réelle (positionDe) ; « Assis ou debout » convient aux deux, le fauteuil
//     compte comme assis, une position inconnue est écartée dès qu'on filtre.

export type FiltrePosition = 'assis' | 'debout' | 'couche';
export type FiltreMateriel = MaterielExercice | 'sans';
export type Origine = 'tous' | 'perso';

export interface FiltresExercices {
  recherche: string;
  origine: Origine;
  type: FamilleExercice | null;
  position: FiltrePosition | null;
  materiel: FiltreMateriel | null;
}

export const FILTRES_VIDES: FiltresExercices = { recherche: '', origine: 'tous', type: null, position: null, materiel: null };

export const normaliserTexte = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function correspondType(ex: Exercice, type: FamilleExercice): boolean {
  return famillesDe(ex).includes(type) || (FAMILLES_PAR_CATEGORIE[ex.categorie] ?? []).includes(type);
}

export function correspondPosition(ex: Exercice, position: FiltrePosition): boolean {
  const pos = positionDe(ex);
  return pos === position || (pos === 'tous' && position !== 'couche');
}

export function correspondMateriel(ex: Exercice, materiel: FiltreMateriel): boolean {
  if (materiel === 'sans') {
    // Matériel non renseigné (exercice historique ou personnel) : on se fie au texte existant.
    return ex.materiels
      ? ex.materiels.every(m => m === 'aucun' || m === 'chaise')
      : !ex.materielNecessaire || /^\s*aucun/i.test(ex.materielNecessaire);
  }
  return (ex.materiels ?? []).includes(materiel);
}

/** Recherche sans accents ni casse, sur le nom puis l'objectif (« pont », « equilibre », « epaule »…). */
export function correspondRecherche(ex: Exercice, recherche: string): boolean {
  const q = normaliserTexte(recherche);
  if (!q) return true;
  return normaliserTexte(ex.nom).includes(q) || (!!ex.objectif && normaliserTexte(ex.objectif).includes(q));
}

export function filtrerExercices(exercices: Exercice[], f: FiltresExercices): Exercice[] {
  return exercices.filter(ex =>
    (f.origine === 'tous' || !!ex.custom)
    && correspondRecherche(ex, f.recherche)
    && (!f.type || correspondType(ex, f.type))
    && (!f.position || correspondPosition(ex, f.position))
    && (!f.materiel || correspondMateriel(ex, f.materiel)),
  );
}

/** Nombre de filtres actifs dans le panneau (hors recherche et onglet), pour le badge du bouton. */
export function nombreFiltresPanneau(f: FiltresExercices, profilActif: boolean): number {
  return [f.type, f.position, f.materiel].filter(Boolean).length + (profilActif ? 1 : 0);
}
