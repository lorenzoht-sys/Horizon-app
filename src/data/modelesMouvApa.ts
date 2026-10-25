import type { Exercice, FamilleExercice, MaterielExercice, TypeProgramme, JourProgramme } from '../types';
import { famillesDe, positionDe } from './exercicesMouvApa';

// ── Modèles de programme Mouv'APA (2026-10-25) ────────────────────────────────
//
// Catalogue PARTAGÉ, dans le code : aucun modèle n'est écrit dans la base de qui que ce soit. Un
// enseignant le prévisualise, puis « Ajouter à mes modèles » ou « Utiliser pour un bénéficiaire »
// crée une copie indépendante dans SA bibliothèque (programmes_modeles), par le mécanisme existant.
// Modifier cette copie, ou le programme qui en découle, ne touche jamais ce catalogue.
//
// Ce sont des BASES : aucun modèle n'est associé à une pathologie. L'enseignant choisit et adapte.
// Les paramètres sont ceux du niveau 2 de chaque exercice, sauf mention contraire ici.
//
// Règles vérifiées par bibliothequeMouvApa.test.ts : un modèle « assis » ne contient AUCUN exercice
// qui fait se lever ; « debout » aucun exercice assis seulement ; « sol » uniquement des exercices au
// sol ou réalisables dans toutes les positions ; « mixte » combine réellement au moins deux positions.

export type PositionModele = 'assis' | 'debout' | 'mixte' | 'sol';
export type NiveauModele = 'debutant' | 'intermediaire' | 'avance';

export interface ExerciceDeModele {
  ref: string;
  series?: number;
  repetitions?: number;
  duree?: number;
  remarque?: string;
}

export interface ModeleMouvApa {
  id: string;
  nom: string;
  famille: FamilleExercice;
  position: PositionModele;
  niveau: NiveauModele;
  objectif: string;
  type?: TypeProgramme;
  exercices: ExerciceDeModele[];
}

export const LIBELLE_POSITION_MODELE: Record<PositionModele, string> = {
  assis: '100 % assis', debout: '100 % debout', mixte: 'Mixte', sol: 'Au sol',
};

export const LIBELLE_NIVEAU_MODELE: Record<NiveauModele, string> = {
  debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé',
};

const m = (
  id: string, nom: string, famille: FamilleExercice, position: PositionModele, niveau: NiveauModele,
  objectif: string, exercices: (string | ExerciceDeModele)[], type?: TypeProgramme,
): ModeleMouvApa => ({
  id, nom, famille, position, niveau, objectif, type,
  exercices: exercices.map(e => (typeof e === 'string' ? { ref: e } : e)),
});

export const MODELES_MOUVAPA: ModeleMouvApa[] = [
  // ── Renforcement membres inférieurs ─────────────────────────────────────────
  m('mod-jambes-assis', 'Jambes – 100 % assis', 'renforcement', 'assis', 'debutant',
    'Renforcer les jambes sans jamais se lever.',
    ['ot-genou-ext', 'ma-flexion-genou-assis', 'ma-flexion-hanche-assise', 'ma-abduction-genoux-elastique',
      'ma-adduction-ballon', 'ma-elevation-talons-assis', 'ma-pression-pieds-sol', 'ma-talons-pointes-assis']),
  m('mod-jambes-debout', 'Jambes – debout sécurisé', 'renforcement', 'debout', 'intermediaire',
    'Renforcer les jambes debout, avec un appui à portée de main.',
    ['force-demi-squat', 'ot-hanche-abd', 'ot-hanche-ext', 'ot-genou-flex', 'ot-mollets',
      'ma-fente-arriere-assistee', 'ma-pas-lateraux', 'force-montee-marche']),
  m('mod-jambes-mixte', 'Jambes – mixte', 'renforcement', 'mixte', 'intermediaire',
    'Alterner le travail assis et debout pour les membres inférieurs.',
    ['ot-genou-ext', 'ma-flexion-hanche-assise', 'force-lever-chaise', 'ot-hanche-abd', 'ot-mollets',
      'ma-adduction-ballon', 'ma-squat-chaise']),
  m('mod-quadriceps', 'Cuisses / quadriceps', 'renforcement', 'mixte', 'intermediaire',
    'Renforcer l\'avant des cuisses, base du lever et de la marche.',
    ['ot-genou-ext', 'univ_03', 'ma-pression-pieds-sol', 'force-lever-chaise', 'force-demi-squat',
      'sep_ex_01', 'force-montee-marche']),
  m('mod-fessiers', 'Fessiers', 'renforcement', 'mixte', 'intermediaire',
    'Renforcer les fessiers (stabilité du bassin, montée d\'escaliers).',
    ['ma-squat-chaise', 'ot-hanche-ext', 'ot-hanche-abd', 'force-pont-fessier', 'ma-clam',
      'ma-fente-arriere-assistee', 'ma-pas-lateraux-elastique']),
  m('mod-hanches', 'Hanches – abducteurs / adducteurs', 'renforcement', 'mixte', 'intermediaire',
    'Renforcer l\'intérieur et l\'extérieur des hanches.',
    ['ma-abduction-genoux-elastique', 'ma-adduction-ballon', 'ot-hanche-abd', 'ma-pas-lateraux-elastique',
      'ma-clam', 'ma-elevation-laterale-jambe']),
  m('mod-chevilles', 'Chevilles / mollets', 'renforcement', 'mixte', 'debutant',
    'Renforcer et mobiliser chevilles et mollets (appui, marche).',
    ['mob-cercles-chevilles', 'mob_chevilles_assis', 'ma-talons-pointes-assis', 'ma-elevation-talons-assis',
      'ot-mollets', 'ma-equilibre-pilates', 'soup-etirement-mollet']),
  m('mod-jambes-elastique', 'Jambes avec élastique', 'renforcement', 'mixte', 'intermediaire',
    'Renforcer les jambes avec un élastique.',
    ['ma-abduction-genoux-elastique', { ref: 'ma-flexion-genou-assis', remarque: 'Élastique autour de la cheville' },
      'ma-pas-lateraux-elastique', { ref: 'ot-genou-ext', remarque: 'Élastique autour de la cheville' },
      'ma-squat-chaise', 'ma-clam']),

  // ── Renforcement haut du corps ──────────────────────────────────────────────
  m('mod-haut-assis', 'Haut du corps – 100 % assis', 'renforcement', 'assis', 'debutant',
    'Renforcer bras, épaules et dos en restant assis.',
    ['ma-curl-biceps', 'ma-extension-triceps', 'ma-elevations-laterales', 'fr_force_03', 'ma-tirage-coudes-serres',
      'ma-serrage-ballon-poitrine', 'ma-retraction-omoplates', 'force-serrage-balle']),
  m('mod-haut-debout', 'Haut du corps – debout', 'renforcement', 'debout', 'intermediaire',
    'Renforcer le haut du corps debout.',
    ['ma-pompes-mur', 'ma-curl-marteau', 'ma-elevations-laterales', 'ma-developpe-poitrine-elastique',
      'ma-tirage-coudes-serres', 'ma-wall-angel', 'ma-ouverture-bras']),
  m('mod-bras', 'Bras – biceps / triceps', 'renforcement', 'assis', 'debutant',
    'Renforcer les bras (porter, se relever en poussant).',
    ['ma-curl-biceps', 'ma-curl-marteau', 'ma-extension-triceps', 'fr_01', 'ma-flexion-poignets',
      'ma-extension-poignets', 'force-serrage-balle']),
  m('mod-dos-posture', 'Dos / posture', 'renforcement', 'debout', 'debutant',
    'Redresser la posture et renforcer le haut du dos.',
    ['ma-auto-grandissement', 'ma-retraction-cervicale', 'ma-retraction-omoplates', 'ma-tirage-coudes-serres',
      'ma-ouverture-bras', 'ma-wall-angel', 'ma-etirement-pectoraux']),
  m('mod-pectoraux', 'Pectoraux', 'renforcement', 'debout', 'intermediaire',
    'Renforcer les muscles de la poussée.',
    ['ma-serrage-ballon-poitrine', 'ma-developpe-poitrine-elastique', 'ma-pompes-mur', 'force-elevation-bras',
      'ma-extension-triceps', 'ma-etirement-pectoraux']),
  m('mod-epaules', 'Épaules', 'renforcement', 'assis', 'intermediaire',
    'Renforcer et protéger les épaules.',
    ['force-rotation-epaule', 'ma-elevations-laterales', 'force-elevation-bras', 'fr_force_03',
      'ma-rotation-externe-elastique', 'ma-retraction-omoplates', 'ma-etirement-deltoide']),
  m('mod-haut-elastique', 'Haut du corps avec élastique', 'renforcement', 'assis', 'intermediaire',
    'Renforcer le haut du corps avec un élastique.',
    ['fr_force_01', 'ma-tirage-coudes-serres', 'ma-developpe-poitrine-elastique', 'ma-ouverture-bras',
      'ma-rotation-externe-elastique', { ref: 'ma-curl-biceps', remarque: 'Élastique sous les pieds' }]),

  // ── Full body ───────────────────────────────────────────────────────────────
  m('mod-full-assis', 'Full Body – 100 % assis', 'renforcement', 'assis', 'debutant',
    'Séance complète sans se lever.',
    ['ma-marche-assise', 'ot-genou-ext', 'ma-flexion-hanche-assise', 'ma-curl-biceps', 'ma-elevations-laterales',
      'ma-tirage-coudes-serres', 'all_03', 'ma-adduction-ballon', 'ma-inclinaison-tronc']),
  m('mod-full-debout', 'Full Body – 100 % debout', 'renforcement', 'debout', 'intermediaire',
    'Séance complète debout, appui à proximité.',
    ['end-marche-place', 'force-demi-squat', 'ma-pompes-mur', 'ot-hanche-abd', 'ma-curl-marteau',
      'ot-mollets', 'ma-wall-angel', 'ma-pas-lateraux']),
  m('mod-full-mixte', 'Full Body – mixte', 'renforcement', 'mixte', 'intermediaire',
    'Séance complète alternant assis et debout.',
    ['ma-marche-assise', 'force-lever-chaise', 'ma-curl-biceps', 'ot-hanche-abd', 'ma-tirage-coudes-serres',
      'ma-pompes-mur', 'ot-genou-ext', 'ma-inclinaison-tronc']),
  m('mod-full-elastique', 'Full Body – élastique', 'renforcement', 'mixte', 'intermediaire',
    'Séance complète avec un seul élastique.',
    ['ma-abduction-genoux-elastique', 'ma-pas-lateraux-elastique', 'fr_force_01', 'ma-developpe-poitrine-elastique',
      'ma-ouverture-bras', 'ma-rotation-externe-elastique', 'ma-squat-chaise']),
  m('mod-full-poids', 'Full Body – bouteilles / petits poids', 'renforcement', 'mixte', 'intermediaire',
    'Séance complète avec de petits poids ou des bouteilles d\'eau.',
    ['ma-curl-biceps', 'ma-curl-marteau', 'ma-extension-triceps', 'ma-elevations-laterales', 'fr_force_03',
      'ma-elevation-talons-assis', 'force-demi-squat', 'ma-flexion-poignets']),
  m('mod-circuit', 'Circuit fonctionnel', 'renforcement', 'debout', 'avance',
    'Enchaîner des gestes du quotidien : se lever, porter, monter, pousser.',
    ['force-lever-chaise', { ref: 'ma-curl-marteau', remarque: 'Comme porter des courses' }, 'force-montee-marche',
      'ma-pompes-mur', 'ma-pas-lateraux', 'ma-fente-arriere-assistee', 'ma-marche-dynamique']),

  // ── Pilates ─────────────────────────────────────────────────────────────────
  m('mod-pilates-chaise-debutant', 'Pilates chaise – débutant', 'pilates', 'assis', 'debutant',
    'Découvrir la respiration, le placement et le centre, assis.',
    ['ma-respiration-latero-thoracique', 'ma-auto-grandissement', 'ma-engagement-centre', 'ma-bascule-bassin',
      'ma-knee-folds', 'ma-rotation-thoracique-pilates']),
  m('mod-pilates-chaise-complet', 'Pilates chaise – complet', 'pilates', 'assis', 'intermediaire',
    'Séance Pilates complète sur chaise : respiration, centre, mobilité, coordination.',
    ['ma-respiration-latero-thoracique', 'ma-auto-grandissement', 'ma-engagement-centre', 'ma-bascule-bassin',
      'ma-knee-folds', 'ma-rotation-thoracique-pilates', 'ma-inclinaison-pilates', 'ma-swimming']),
  m('mod-pilates-debout', 'Pilates debout', 'pilates', 'debout', 'intermediaire',
    'Pilates debout : axe, centre et équilibre.',
    ['ma-respiration-latero-thoracique', 'ma-auto-grandissement', 'ma-engagement-centre', 'ma-roll-down',
      'ma-demi-squat-pilates', 'ma-equilibre-pilates', 'ma-wall-angel']),
  m('mod-pilates-sol-debutant', 'Pilates au sol – débutant', 'pilates', 'sol', 'debutant',
    'Pilates au sol pour débuter : bassin stable et centre.',
    ['ma-respiration-latero-thoracique', 'ma-engagement-centre', 'ma-bascule-bassin', 'ma-knee-folds',
      'ma-heel-slides', 'ma-pont-pilates', 'ma-ouverture-genou']),
  m('mod-pilates-centre', 'Pilates centre du corps', 'pilates', 'sol', 'intermediaire',
    'Renforcer le centre du corps avec contrôle.',
    ['ma-respiration-latero-thoracique', 'ma-engagement-centre', 'ma-knee-folds', 'ma-toe-taps', 'ma-dead-bug',
      'ma-pont-pilates', 'ma-bird-dog']),
  m('mod-pilates-dos', 'Pilates dos / posture', 'pilates', 'mixte', 'intermediaire',
    'Posture et mobilité de la colonne.',
    ['ma-respiration-latero-thoracique', 'ma-auto-grandissement', 'ma-bascule-bassin', 'ma-rotation-thoracique-pilates',
      'ma-inclinaison-pilates', 'ma-swimming', 'ma-roll-down']),
  m('mod-pilates-jambes', 'Pilates jambes / fessiers', 'pilates', 'mixte', 'intermediaire',
    'Fessiers et jambes avec placement Pilates.',
    ['ma-respiration-latero-thoracique', 'ma-engagement-centre', 'ma-pont-pilates', 'ma-clam', 'ma-elevation-laterale-jambe',
      'ma-heel-slides', 'ma-demi-squat-pilates', 'ma-equilibre-pilates']),
  m('mod-pilates-mobilite', 'Pilates mobilité', 'pilates', 'sol', 'debutant',
    'Mobilité de la colonne et des hanches, respiration guidée.',
    ['ma-respiration-latero-thoracique', 'ma-bascule-bassin', 'ma-rotation-genoux', 'ma-heel-slides',
      'ma-ouverture-genou', 'soup-dos-chat', 'all_01']),
  m('mod-pilates-equilibre', 'Pilates équilibre', 'pilates', 'debout', 'intermediaire',
    'Équilibre par l\'axe et le centre.',
    ['ma-respiration-latero-thoracique', 'ma-auto-grandissement', 'ma-engagement-centre', 'ma-equilibre-pilates',
      'ma-demi-squat-pilates', 'ma-semi-tandem', 'ma-lever-pied']),

  // ── Mobilité ────────────────────────────────────────────────────────────────
  m('mod-mobilite-assis', 'Mobilité globale – 100 % assis', 'mobilite', 'assis', 'debutant',
    'Mobiliser toutes les articulations, assis.',
    ['ma-cervicale-rotation', 'ma-haussement-epaules', 'fr_ech_01', 'ma-flexion-epaules', 'fr_02',
      'ma-bascule-bassin', 'mob-flexion-genou', 'mob-cercles-chevilles']),
  m('mod-mobilite-debout', 'Mobilité globale – debout', 'mobilite', 'debout', 'intermediaire',
    'Mobiliser le corps debout.',
    ['ma-haussement-epaules', 'ma-flexion-epaules', 'ma-abduction-epaules', 'ma-inclinaison-tronc',
      'ma-cercles-bassin', 'mob_flexion_hanche_debout', 'mob_extension_hanche_debout', 'ma-wall-angel']),
  m('mod-mobilite-mixte', 'Mobilité globale – mixte', 'mobilite', 'mixte', 'debutant',
    'Mobilité de la tête aux pieds, assis puis debout.',
    ['ma-cervicale-flexion', 'fr_ech_01', 'ma-flexion-epaules', 'mob-rotation-tronc', 'ma-ouverture-hanche',
      'mob_flexion_hanche_debout', 'ma-cercles-bassin', 'mob-cercles-chevilles']),
  m('mod-mobilite-haut', 'Mobilité haut du corps', 'mobilite', 'assis', 'debutant',
    'Cou, épaules, coudes, poignets et haut du dos.',
    ['ma-cervicale-flexion', 'ma-cervicale-rotation', 'ma-cervicale-inclinaison', 'ma-haussement-epaules',
      'ma-flexion-epaules', 'ma-abduction-epaules', 'fr_01', 'fr_ech_02', 'fr_02']),
  m('mod-mobilite-bas', 'Mobilité membres inférieurs', 'mobilite', 'assis', 'debutant',
    'Hanches, genoux et chevilles.',
    ['ma-ouverture-hanche', 'ma-rotation-hanche', 'mob-flexion-genou', 'ma-talons-pointes-assis',
      'mob-cercles-chevilles', 'mob_chevilles_assis', 'ma-bascule-bassin']),
  m('mod-reveil-articulaire', 'Réveil articulaire', 'mobilite', 'assis', 'debutant',
    'Quelques minutes pour dérouiller les articulations, le matin ou en début de séance.',
    ['ma-haussement-epaules', 'fr_ech_01', 'ma-cervicale-rotation', 'fr_ech_02', 'mob-rotation-tronc',
      'ma-talons-pointes-assis', 'mob-cercles-chevilles']),

  // ── Souplesse ───────────────────────────────────────────────────────────────
  m('mod-souplesse-assis', 'Souplesse – 100 % assis', 'souplesse', 'assis', 'debutant',
    'Étirements doux sans se lever.',
    ['ma-cervicale-inclinaison', 'ma-etirement-deltoide', 'ma-etirement-triceps', 'ma-etirement-grand-dorsal',
      'ma-ouverture-thoracique', 'fr_souplesse_01', 'ma-etirement-fessiers', 'ma-etirement-adducteurs']),
  m('mod-souplesse-debout', 'Souplesse – debout', 'souplesse', 'debout', 'intermediaire',
    'Étirements debout, appui à proximité.',
    ['soup-etirement-mollet', 'soup-quadriceps', 'ma-etirement-flechisseurs', 'ma-etirement-pectoraux',
      'ma-etirement-grand-dorsal', 'ma-inclinaison-tronc', 'ma-etirement-deltoide']),
  m('mod-souplesse-globale', 'Souplesse globale', 'souplesse', 'mixte', 'debutant',
    'Étirer les grands groupes musculaires.',
    ['ma-etirement-grand-dorsal', 'ma-etirement-pectoraux', 'ma-etirement-triceps', 'ma-inclinaison-tronc',
      'fr_souplesse_01', 'soup-etirement-mollet', 'soup-quadriceps', 'ma-etirement-fessiers']),
  m('mod-souplesse-bas', 'Souplesse membres inférieurs', 'souplesse', 'mixte', 'debutant',
    'Mollets, cuisses, hanches.',
    ['soup-etirement-mollet', 'soup-quadriceps', 'fr_souplesse_01', 'ma-etirement-adducteurs',
      'ma-etirement-fessiers', 'ma-etirement-flechisseurs']),
  m('mod-souplesse-haut', 'Souplesse haut du corps', 'souplesse', 'assis', 'debutant',
    'Cou, épaules, bras et dos.',
    ['ma-cervicale-inclinaison', 'ma-etirement-deltoide', 'ma-etirement-triceps', 'ma-etirement-grand-dorsal',
      'ma-ouverture-thoracique', 'ma-inclinaison-tronc']),

  // ── Cardio / endurance ──────────────────────────────────────────────────────
  m('mod-cardio-assis', 'Cardio – 100 % assis', 'cardio', 'assis', 'debutant',
    'Élever doucement la fréquence cardiaque sans se lever.',
    ['ma-marche-assise', 'ma-flexion-hanche-assise', 'ma-talons-alternes', 'ma-step-touch-assis',
      'ma-boxe-assise', 'ma-marche-assise-dynamique', 'ma-respiration-latero-thoracique']),
  m('mod-cardio-debout', 'Cardio debout sans impact', 'cardio', 'debout', 'intermediaire',
    'Endurance debout, sans saut ni impact.',
    ['end-marche-place', 'ma-step-touch-debout', 'ma-pointes-alternees', 'end_montee_genoux_place',
      'ma-talons-fesses', 'ma-pas-lateraux', 'ma-marche-avant-arriere']),
  m('mod-cardio-mixte', 'Cardio – mixte', 'cardio', 'mixte', 'intermediaire',
    'Alterner cardio assis et debout selon la fatigue.',
    ['ma-marche-assise', 'end-marche-place', 'ma-boxe-assise', 'ma-step-touch-debout', 'ma-talons-alternes',
      'end_montee_genoux_place', 'ma-marche-assise-dynamique']),
  m('mod-cardio-renfo', 'Cardio + renforcement', 'cardio', 'mixte', 'avance',
    'Alterner exercices cardio et exercices de force.',
    ['end-marche-place', 'force-lever-chaise', 'ma-step-touch-debout', 'ma-pompes-mur', 'end_montee_genoux_place',
      'ma-squat-chaise', 'ma-boxe-assise', 'ma-curl-biceps']),
  m('mod-marche-fractionnee', 'Marche fractionnée', 'cardio', 'debout', 'intermediaire',
    'Alterner allure confortable et allure plus soutenue.',
    ['end-marche-place', { ref: 'end_marche_fractionnee', remarque: 'Alterner 2 min confortable / 1 min soutenue' },
      'ma-marche-dynamique', 'ma-marche-avant-arriere', 'soup-etirement-mollet', 'all_01']),

  // ── Équilibre ───────────────────────────────────────────────────────────────
  m('mod-equilibre-chaise', 'Équilibre avec chaise', 'equilibre', 'debout', 'debutant',
    'Travailler l\'équilibre debout avec une chaise en appui.',
    ['ma-assis-debout-stabilisation', 'ot-transfert-lateral', 'ma-transfert-avant-arriere', 'ma-pieds-rapproches',
      'ma-semi-tandem', 'ma-lever-pied', 'ma-pas-lateraux-appui']),
  m('mod-equilibre-debout', 'Équilibre debout', 'equilibre', 'debout', 'intermediaire',
    'Équilibre statique, de la station pieds serrés à l\'appui unipodal.',
    ['ma-pieds-rapproches', 'ma-semi-tandem', 'ot-tandem-statique', 'eq-unipodal', 'ma-cibles-pied',
      'ma-equilibre-pilates', 'eq-transfert']),
  m('mod-equilibre-dynamique', 'Équilibre dynamique', 'equilibre', 'debout', 'avance',
    'Équilibre en mouvement : marcher, tourner, enjamber.',
    ['ot-marche-tandem', 'ma-marche-changement-direction', 'ma-marche-obstacles', 'ma-franchissement-obstacles',
      'ma-step-avant-arriere', 'ma-demi-tour', 'ot-marche-arriere']),
  m('mod-prevention-chutes', 'Prévention des chutes', 'equilibre', 'debout', 'intermediaire',
    'Force des jambes, équilibre et gestes qui évitent la chute.',
    ['force-lever-chaise', 'ot-genou-flex', 'ot-hanche-abd', 'ot-mollets', 'ot-tandem-statique',
      'ma-lever-pied', 'ma-franchissement-obstacles', 'ma-demi-tour']),

  // ── Coordination / cognition ────────────────────────────────────────────────
  m('mod-coordination-assis', 'Coordination – 100 % assis', 'coordination', 'assis', 'debutant',
    'Coordination croisée et réactivité, assis.',
    ['ma-main-genou-oppose', 'ma-bras-jambes-opposes', 'ma-ballon-mains', 'ma-parties-corps', 'ma-sequence-3-mouvements',
      'ma-boxe-assise', 'all_02']),
  m('mod-coordination-debout', 'Coordination – debout', 'coordination', 'debout', 'intermediaire',
    'Coordination en marchant et en se déplaçant.',
    ['ma-marche-bras', 'ma-step-touch-debout', 'ma-pas-couleurs', 'ma-cibles-pied', 'ma-pointes-alternees',
      'ma-marche-changement-direction']),
  m('mod-double-tache', 'Double tâche physique + cognitive', 'cognitif', 'mixte', 'intermediaire',
    'Associer un mouvement et une tâche mentale.',
    ['ma-genoux-calcul', 'mem-double-tache', 'ma-marche-categories', 'ma-transfert-cognitif',
      'ma-assis-debout-memorisation', 'ma-pas-couleurs', 'ma-sequence-4-mouvements', 'all_02']),
  m('mod-ballon-cognition', 'Ballon + cognition', 'cognitif', 'assis', 'debutant',
    'Coordination des mains et attention avec un ballon.',
    ['ma-ballon-mains', { ref: 'ma-ballon-mains', remarque: 'Nommer une couleur ou un fruit à chaque passage' },
      'ma-serrage-ballon-poitrine', 'ma-parties-corps', 'ma-sequence-3-mouvements', 'mem-jeu-paires']),

  // ── Programmes autonomes ────────────────────────────────────────────────────
  m('mod-routine-assis', 'Routine quotidienne – 10 min assis', 'mobilite', 'assis', 'debutant',
    'Une courte routine quotidienne, à faire seul, assis.',
    [{ ref: 'ma-marche-assise', series: 1 }, { ref: 'ma-haussement-epaules', series: 1 }, { ref: 'ot-genou-ext', series: 1 },
      { ref: 'ma-curl-biceps', series: 1 }, { ref: 'ma-talons-pointes-assis', series: 1 }, { ref: 'ma-inclinaison-tronc', series: 1 },
      { ref: 'all_01', series: 1 }], 'quotidien'),
  m('mod-routine-debout', 'Routine quotidienne – 10 min debout', 'mobilite', 'debout', 'debutant',
    'Une courte routine quotidienne debout, près d\'un appui.',
    [{ ref: 'end-marche-place', series: 1 }, { ref: 'force-demi-squat', series: 1 }, { ref: 'ot-mollets', series: 1 },
      { ref: 'ma-pompes-mur', series: 1 }, { ref: 'ma-pieds-rapproches', series: 1 }, { ref: 'soup-etirement-mollet', series: 1 }], 'quotidien'),
  m('mod-routine-20', 'Routine forme – 20 min', 'renforcement', 'mixte', 'intermediaire',
    'Une routine plus complète pour les jours où l\'on a un peu plus de temps.',
    ['ma-marche-assise', 'force-lever-chaise', 'ma-curl-biceps', 'ot-hanche-abd', 'ma-tirage-coudes-serres',
      'ma-semi-tandem', 'ma-inclinaison-tronc', 'all_01'], 'domicile'),
  m('mod-entretien-doux', 'Entretien global doux', 'mobilite', 'assis', 'debutant',
    'Entretien en douceur : mobilité, renforcement léger, respiration.',
    ['ma-respiration-latero-thoracique', 'ma-haussement-epaules', 'ma-flexion-epaules', 'ot-genou-ext',
      'ma-talons-pointes-assis', 'ma-serrage-ballon-poitrine', 'ma-ouverture-thoracique'], 'domicile'),
  m('mod-forme-generale', 'Forme générale', 'renforcement', 'debout', 'intermediaire',
    'Entretenir force, endurance et équilibre.',
    ['end-marche-place', 'ma-squat-chaise', 'ma-pompes-mur', 'ma-tirage-coudes-serres', 'ot-hanche-abd',
      'ma-semi-tandem', 'ma-step-touch-debout', 'soup-etirement-mollet'], 'domicile'),
  m('mod-retour-calme', 'Retour au calme / récupération', 'recuperation', 'assis', 'debutant',
    'Ramener le corps au calme après l\'effort.',
    ['all_01', 'ma-respiration-latero-thoracique', 'ma-haussement-epaules', 'ma-cervicale-inclinaison',
      'ma-etirement-grand-dorsal', 'ma-etirement-fessiers', 'fr_souplesse_01'], 'recuperation'),
];

// ── Résolution et conversion vers le format « Mes modèles » ───────────────────

export interface ExerciceResolu {
  exercice: Exercice;
  series: number;
  repetitions: number | null;
  dureeSecondes: number | null;
  remarque?: string;
}

// Quelques exercices historiques ont une durée de référence pensée pour une séance ENTIÈRE (ex.
// « Marche sur place » : 20 min). Intégrés comme un exercice parmi d'autres dans un modèle, ils
// prennent ces valeurs — l'exercice d'origine, lui, n'est pas modifié.
const PARAMETRES_EN_SEANCE: Record<string, { series: number; duree: number }> = {
  'end-marche-place': { series: 1, duree: 120 },
  'end_montee_genoux_place': { series: 2, duree: 45 },
  'end_marche_fractionnee': { series: 1, duree: 900 },
  'all_02': { series: 1, duree: 120 },
  'mem-double-tache': { series: 1, duree: 120 },
};

/** Paramètres : ceux du modèle, sinon ceux « en séance » ci-dessus, sinon le niveau 2 de l'exercice. */
export function resoudreExercices(modele: ModeleMouvApa, catalogue: Exercice[]): ExerciceResolu[] {
  const out: ExerciceResolu[] = [];
  for (const brut of modele.exercices) {
    const exercice = catalogue.find(x => x.id === brut.ref);
    if (!exercice) continue;
    const enSeance = PARAMETRES_EN_SEANCE[brut.ref];
    const e: ExerciceDeModele = enSeance ? { series: enSeance.series, duree: enSeance.duree, ...brut } : brut;
    const n2 = exercice.niveau_config?.['2'];
    const repetitions = e.repetitions ?? (e.duree != null ? null : n2?.repetitions ?? (n2?.duree_secondes != null ? null : 10));
    const dureeSecondes = repetitions != null ? null : (e.duree ?? n2?.duree_secondes ?? 30);
    out.push({ exercice, series: e.series ?? n2?.series ?? 2, repetitions, dureeSecondes, remarque: e.remarque });
  }
  return out;
}

/** Matériel réellement nécessaire = réunion du matériel des exercices (jamais déclaré à la main). */
export function materielsDuModele(modele: ModeleMouvApa, catalogue: Exercice[]): MaterielExercice[] {
  const set = new Set<MaterielExercice>();
  for (const r of resoudreExercices(modele, catalogue)) {
    for (const mat of r.exercice.materiels ?? []) if (mat !== 'aucun') set.add(mat);
  }
  return [...set];
}

/** Durée indicative en minutes (effort + récupération), arrondie à 5. */
export function dureeIndicative(modele: ModeleMouvApa, catalogue: Exercice[]): number {
  const sec = resoudreExercices(modele, catalogue).reduce((total, r) => {
    const effort = r.repetitions != null ? r.repetitions * 4 : (r.dureeSecondes ?? 30);
    return total + r.series * effort + Math.max(0, r.series - 1) * 45 + 30;
  }, 0);
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

export function famillesDuModele(modele: ModeleMouvApa, catalogue: Exercice[]): FamilleExercice[] {
  const set = new Set<FamilleExercice>([modele.famille]);
  for (const r of resoudreExercices(modele, catalogue)) famillesDe(r.exercice).forEach(f => set.add(f));
  return [...set];
}

export { positionDe };

// Libellés de catégorie stockés dans programme_modele_exercices.categorie : les mêmes que ceux écrits
// par l'éditeur de modèles (CAT_DB_TO_LABEL, ProgrammeWizard.tsx), pour un affichage identique.
const CATEGORIE_LIBELLE: Record<Exercice['categorie'], string> = {
  equilibre: 'Équilibre', force: 'Force', mobilite: 'Souplesse',
  souplesse: 'Souplesse', endurance: 'Endurance', memoire: 'Coordination',
};

export const PLANNING_PAR_DEFAUT: JourProgramme[] = ['lundi', 'mercredi', 'vendredi'];

export interface DonneesModeleCopie {
  nom: string;
  objectif?: string;
  type: TypeProgramme;
  seances: Array<{
    tempId: string;
    nom: string;
    description?: string;
    exercices: Array<{
      nom: string; categorie?: string; description?: string; conseilSecurite?: string;
      series?: number; repetitions?: number; dureeSecondes?: number;
    }>;
  }>;
  planning: Partial<Record<JourProgramme, string | null>>;
}

/**
 * Copie d'un modèle Mouv'APA au format attendu par createModele (useProgrammesModeles). Une seule
 * séance, planifiée lundi / mercredi / vendredi par défaut (l'enseignant modifie ensuite). Le texte
 * vu par le bénéficiaire reprend la description, la consigne respiratoire et la remarque du modèle.
 */
export function versDonneesModele(modele: ModeleMouvApa, catalogue: Exercice[]): DonneesModeleCopie {
  const tempId = `seance-${modele.id}`;
  return {
    nom: modele.nom,
    objectif: modele.objectif,
    type: modele.type ?? 'domicile',
    seances: [{
      tempId,
      nom: modele.nom,
      exercices: resoudreExercices(modele, catalogue).map(r => ({
        nom: r.exercice.nom,
        categorie: CATEGORIE_LIBELLE[r.exercice.categorie],
        description: [
          r.exercice.description,
          r.exercice.respiration ? `Respiration : ${r.exercice.respiration}` : '',
          r.remarque ? `Remarque : ${r.remarque}` : '',
        ].filter(Boolean).join('\n'),
        conseilSecurite: r.exercice.consigneSecurite,
        series: r.series,
        repetitions: r.repetitions ?? undefined,
        dureeSecondes: r.dureeSecondes ?? undefined,
      })),
    }],
    planning: Object.fromEntries(PLANNING_PAR_DEFAUT.map(j => [j, tempId])),
  };
}
