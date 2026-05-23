import type { Exercice } from '../types';

export const EXERCICES_BASE: Exercice[] = [
  // ÉQUILIBRE
  {
    id: 'eq-unipodal',
    nom: 'Équilibre unipodal',
    categorie: 'equilibre',
    description: 'Tenez-vous sur un pied le plus longtemps possible.',
    consigneSecurite: 'Restez près d\'une chaise ou d\'un mur pour vous rattraper.',
    niveaux: {
      debutant: '10 secondes chaque pied, les yeux ouverts',
      intermediaire: '20 secondes chaque pied, les yeux ouverts',
      avance: '30 secondes chaque pied, les yeux fermés',
    },
    materielNecessaire: 'Chaise stable',
    dureeEstimeeMinutes: 5,
  },
  {
    id: 'eq-tandem',
    nom: 'Marche en tandem',
    categorie: 'equilibre',
    description: 'Marchez en ligne droite, talon contre pointe, comme sur un fil.',
    consigneSecurite: 'Près d\'un mur ou d\'une table pour se stabiliser.',
    niveaux: {
      debutant: '5 pas en tenant le mur',
      intermediaire: '10 pas sans appui',
      avance: '15 pas les yeux fermés',
    },
    dureeEstimeeMinutes: 5,
  },
  {
    id: 'eq-transfert',
    nom: 'Transfert de poids',
    categorie: 'equilibre',
    description: 'Debout, transférez votre poids d\'un pied sur l\'autre lentement.',
    consigneSecurite: 'Tenez-vous près d\'une chaise.',
    niveaux: {
      debutant: '10 transferts lents, debout près d\'un appui',
      intermediaire: '20 transferts sans appui',
      avance: '20 transferts en levant les bras de chaque côté',
    },
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'eq-marche-talon',
    nom: 'Marche talon-pointe',
    categorie: 'equilibre',
    description: 'Marchez en posant d\'abord le talon puis la pointe du pied.',
    consigneSecurite: 'Couloir dégagé, chaussures à semelle plate.',
    niveaux: {
      debutant: '5 mètres, mains longeant le mur',
      intermediaire: '10 mètres sans appui',
      avance: '10 mètres en tournant la tête de gauche à droite',
    },
    dureeEstimeeMinutes: 5,
  },

  // FORCE MEMBRES INFÉRIEURS
  {
    id: 'force-lever-chaise',
    nom: 'Lever de chaise',
    categorie: 'force',
    description: 'Levez-vous et asseyez-vous d\'une chaise sans aide des mains.',
    consigneSecurite: 'Chaise stable contre un mur. Si difficile, aidez-vous des mains.',
    niveaux: {
      debutant: '5 répétitions, avec aide des mains',
      intermediaire: '10 répétitions, mains croisées sur la poitrine',
      avance: '15 répétitions, le plus vite possible',
    },
    materielNecessaire: 'Chaise robuste',
    dureeEstimeeMinutes: 5,
  },
  {
    id: 'force-demi-squat',
    nom: 'Demi-squat',
    categorie: 'force',
    description: 'Fléchissez les genoux en descendant les fesses comme pour s\'asseoir, puis revenez.',
    consigneSecurite: 'Ne dépassez pas 90° de flexion. Genoux dans l\'axe des orteils.',
    niveaux: {
      debutant: '8 répétitions, descente jusqu\'à 30°',
      intermediaire: '10 répétitions, descente jusqu\'à 60°',
      avance: '12 répétitions, descente lente 3 secondes',
    },
    dureeEstimeeMinutes: 5,
  },
  {
    id: 'force-pont-fessier',
    nom: 'Pont fessier',
    categorie: 'force',
    description: 'Allongé sur le dos, genoux fléchis, soulevez le bassin en contractant les fessiers.',
    niveaux: {
      debutant: '8 répétitions, tenir 1 seconde en haut',
      intermediaire: '10 répétitions, tenir 3 secondes en haut',
      avance: '12 répétitions avec une jambe tendue en l\'air',
    },
    materielNecessaire: 'Tapis de sol',
    dureeEstimeeMinutes: 6,
  },
  {
    id: 'force-montee-marche',
    nom: 'Montée de marche',
    categorie: 'force',
    description: 'Montez et descendez d\'une marche ou d\'un step en alternant les jambes.',
    consigneSecurite: 'Tenez-vous à la rampe. Pied entier sur la marche.',
    niveaux: {
      debutant: '10 montées avec appui, même jambe',
      intermediaire: '15 montées alternées sans appui',
      avance: '20 montées alternées, rythme soutenu',
    },
    materielNecessaire: 'Marche ou step stable',
    dureeEstimeeMinutes: 6,
  },

  // FORCE MEMBRES SUPÉRIEURS
  {
    id: 'force-rotation-epaule',
    nom: 'Rotation des épaules',
    categorie: 'force',
    description: 'Bras tendus sur les côtés, faites de petits cercles avec les épaules.',
    niveaux: {
      debutant: '10 cercles avant et arrière, sans résistance',
      intermediaire: '15 cercles avec légères bouteilles d\'eau (500ml)',
      avance: '20 cercles avec bouteilles d\'un litre',
    },
    materielNecessaire: 'Optionnel : bouteilles d\'eau',
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'force-elevation-bras',
    nom: 'Élévation des bras',
    categorie: 'force',
    description: 'Assis, levez les bras devant vous jusqu\'à l\'horizontal, puis redescendez lentement.',
    niveaux: {
      debutant: '10 répétitions, mains vides',
      intermediaire: '12 répétitions avec bouteilles 500ml',
      avance: '15 répétitions avec bouteilles 1L ou élastique',
    },
    materielNecessaire: 'Optionnel : bouteilles ou élastique',
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'force-serrage-balle',
    nom: 'Serrage de balle',
    categorie: 'force',
    description: 'Serrez une balle molle dans la paume le plus fort possible, puis relâchez.',
    niveaux: {
      debutant: '10 serrages, 2 secondes chacun, chaque main',
      intermediaire: '15 serrages, 3 secondes chacun',
      avance: '20 serrages, alternance rapide',
    },
    materielNecessaire: 'Balle en mousse ou éponge',
    dureeEstimeeMinutes: 3,
  },

  // MOBILITÉ
  {
    id: 'mob-rotation-tronc',
    nom: 'Rotation du tronc',
    categorie: 'mobilite',
    description: 'Assis, les bras croisés sur la poitrine, tournez le buste lentement de chaque côté.',
    niveaux: {
      debutant: '5 rotations de chaque côté, amplitude réduite',
      intermediaire: '10 rotations de chaque côté, amplitude complète',
      avance: '10 rotations avec bras tendus devant',
    },
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'mob-cercles-chevilles',
    nom: 'Cercles de chevilles',
    categorie: 'mobilite',
    description: 'Assis, soulevez un pied et dessinez de grands cercles avec votre pied.',
    niveaux: {
      debutant: '10 cercles dans chaque sens, chaque pied',
      intermediaire: '15 cercles, en tirant bien les orteils',
      avance: '20 cercles, pied tenu 30 secondes surélevé après',
    },
    dureeEstimeeMinutes: 3,
  },
  {
    id: 'mob-flexion-genou',
    nom: 'Flexion-extension du genou',
    categorie: 'mobilite',
    description: 'Assis, tendez et fléchissez un genou en amplitude maximale.',
    niveaux: {
      debutant: '10 mouvements lents, chaque jambe',
      intermediaire: '15 mouvements, tenir 2s en extension',
      avance: '20 mouvements, ajouter légère résistance avec la main',
    },
    dureeEstimeeMinutes: 4,
  },

  // SOUPLESSE
  {
    id: 'soup-etirement-mollet',
    nom: 'Étirement du mollet',
    categorie: 'souplesse',
    description: 'Debout face au mur, jambe arrière tendue, poussez le talon au sol.',
    consigneSecurite: 'Pas de douleur. Arrêtez à la sensation d\'étirement.',
    niveaux: {
      debutant: 'Tenir 20 secondes chaque jambe',
      intermediaire: 'Tenir 30 secondes, légère inclinaison avant',
      avance: 'Tenir 45 secondes, orteils relevés contre le mur',
    },
    materielNecessaire: 'Mur stable',
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'soup-quadriceps',
    nom: 'Étirement du quadriceps',
    categorie: 'souplesse',
    description: 'Debout, ramenez un pied vers les fessiers en tenant la cheville.',
    consigneSecurite: 'Tenez-vous à un appui. Ne forcez pas si douleur au genou.',
    niveaux: {
      debutant: 'Tenir 20s avec appui, chaque jambe',
      intermediaire: 'Tenir 30s sans appui',
      avance: 'Tenir 40s, penchez légèrement en avant',
    },
    materielNecessaire: 'Chaise pour s\'appuyer',
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'soup-dos-chat',
    nom: 'Dos chat-chameau',
    categorie: 'souplesse',
    description: 'À quatre pattes, arrondissez le dos vers le plafond (chat) puis cambrez-le (chameau).',
    niveaux: {
      debutant: '5 cycles lents chat-chameau',
      intermediaire: '10 cycles avec pause 3s à chaque position',
      avance: '15 cycles avec respiration synchronisée',
    },
    materielNecessaire: 'Tapis de sol',
    dureeEstimeeMinutes: 5,
  },

  // ENDURANCE
  {
    id: 'end-marche-place',
    nom: 'Marche sur place',
    categorie: 'endurance',
    description: 'Marchez sur place en levant bien les genoux.',
    niveaux: {
      debutant: '2 minutes, rythme confortable, genoux à mi-hauteur',
      intermediaire: '4 minutes, genoux à hauteur des hanches',
      avance: '6 minutes, bras qui balancent, rythme soutenu',
    },
    dureeEstimeeMinutes: 6,
  },
  {
    id: 'end-stepping',
    nom: 'Stepping sur step',
    categorie: 'endurance',
    description: 'Montez-descendez d\'un step au rythme d\'une musique lente.',
    consigneSecurite: 'Tenez-vous à la rampe si déséquilibre. Arrêtez si essoufflement important.',
    niveaux: {
      debutant: '3 minutes, rythme lent, même jambe en avant',
      intermediaire: '5 minutes, alternance des jambes',
      avance: '8 minutes, rythme modéré',
    },
    materielNecessaire: 'Step ou marche basse',
    dureeEstimeeMinutes: 8,
  },
  {
    id: 'end-velo-air',
    nom: 'Vélo dans l\'air',
    categorie: 'endurance',
    description: 'Allongé sur le dos, pédalez dans les airs comme à vélo.',
    niveaux: {
      debutant: '30 secondes, amplitude modérée',
      intermediaire: '60 secondes, amplitude complète',
      avance: '2 minutes, variation lent/vite',
    },
    materielNecessaire: 'Tapis de sol',
    dureeEstimeeMinutes: 5,
  },

  // MÉMOIRE / DOUBLE TÂCHE
  {
    id: 'mem-double-tache',
    nom: 'Marche et calcul mental',
    categorie: 'memoire',
    description: 'Marchez en salle et comptez à rebours de 3 en 3 (par exemple 30, 27, 24…)',
    niveaux: {
      debutant: 'Compter de 2 en 2 à partir de 20, 2 minutes',
      intermediaire: 'Compter de 3 en 3 à partir de 30, 3 minutes',
      avance: 'Compter de 7 en 7 à partir de 100, 4 minutes',
    },
    dureeEstimeeMinutes: 4,
  },
  {
    id: 'mem-jeu-paires',
    nom: 'Jeu des paires verbal',
    categorie: 'memoire',
    description: 'Pierre énonce 5 paires de mots. Le patient les répète immédiatement, puis après 5 minutes.',
    niveaux: {
      debutant: '3 paires de mots simples',
      intermediaire: '5 paires de mots variés',
      avance: '7 paires de mots avec délai de 10 minutes',
    },
    dureeEstimeeMinutes: 10,
  },
];

const CUSTOM_KEY = 'mouvtrack_custom_exercices';

export function loadExercices(): Exercice[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const custom: Exercice[] = raw ? JSON.parse(raw) : [];
    return [...EXERCICES_BASE, ...custom];
  } catch {
    return EXERCICES_BASE;
  }
}

export function saveCustomExercice(ex: Exercice) {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const custom: Exercice[] = raw ? JSON.parse(raw) : [];
    custom.push({ ...ex, custom: true });
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  } catch {
    console.error('Erreur sauvegarde exercice');
  }
}
