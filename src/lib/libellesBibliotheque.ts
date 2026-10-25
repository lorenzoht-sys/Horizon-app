import type { FamilleExercice, MaterielExercice } from '../types';

// Libellés d'affichage de la bibliothèque (exercices et modèles Mouv'APA), partagés par les écrans.

export const LIBELLE_FAMILLE: Record<FamilleExercice, string> = {
  renforcement: 'Renforcement',
  cardio: 'Endurance / Cardio',
  mobilite: 'Mobilité',
  souplesse: 'Souplesse',
  equilibre: 'Équilibre',
  coordination: 'Coordination',
  cognitif: 'Cognitif / double tâche',
  pilates: 'Pilates',
  respiration: 'Respiration',
  recuperation: 'Récupération',
};

export const LIBELLE_MATERIEL_COURT: Record<MaterielExercice, string> = {
  aucun: 'Aucun',
  chaise: 'Chaise',
  mur: 'Mur',
  elastique: 'Élastique',
  ballon: 'Ballon',
  coussin: 'Coussin',
  petits_poids: 'Petits poids / bouteilles',
  step: 'Step / marche',
  tapis: 'Tapis',
};

export const LIBELLE_POSITION_EXERCICE: Record<'assis' | 'debout' | 'couche' | 'tous', string> = {
  assis: 'Assis',
  debout: 'Debout',
  couche: 'Au sol',
  tous: 'Assis ou debout',
};
