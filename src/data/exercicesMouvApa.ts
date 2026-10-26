import type {
  Exercice, CategorieExercice, FamilleExercice, MaterielExercice, NiveauConfig,
} from '../types';

// ── Bibliothèque Mouv'APA (2026-10-25) ────────────────────────────────────────
//
// Exercices AJOUTÉS au catalogue historique (EXERCICES_HISTORIQUES, exercices.ts), qui est conservé
// tel quel : aucun exercice existant n'est retiré, renommé ni modifié dans ses champs historiques.
// Seuls les exercices réellement absents sont ici — ceux de la demande qui existaient déjà sont
// réutilisés par leur identifiant (voir CORRESPONDANCES_EXISTANTS ci-dessous) ; le test
// bibliothequeMouvApa.test.ts refuse tout nom en double, y compris approché.
//
// Tous sont `horsCatalogueIA` : la génération de programme par IA garde exactement son catalogue
// d'avant (plafond de taille du prompt, voir genererProgrammeIA.test.ts).
//
// Les paramètres (séries, répétitions, durées) sont des valeurs de DÉPART, toujours modifiables par
// l'enseignant ; ils ne remplacent pas son jugement clinique.

type Position = 'assis' | 'debout' | 'couche' | 'tous';

interface Definition {
  id: string;
  nom: string;
  categorie: CategorieExercice;
  familles: FamilleExercice[];
  position: Position;
  materiels?: MaterielExercice[];
  description: string;
  securite: string;
  objectif?: string;
  respiration?: string;
  facile?: string;
  difficile?: string;
  /** Paramètres du niveau 2 (référence) : répétitions OU durée en secondes. */
  series: number;
  repetitions?: number;
  duree?: number;
}

export const RESPIRATION_PILATES =
  'Inspirer pour préparer le mouvement. Expirer pendant l\'effort en engageant doucement la sangle abdominale. Réaliser le mouvement lentement, avec contrôle et sans bloquer la respiration.';

const NOTE_POIDS = 'De petites bouteilles d\'eau (0,5 L) peuvent remplacer les poids.';

const LIBELLE_MATERIEL: Record<MaterielExercice, string> = {
  aucun: 'Aucun',
  chaise: 'Chaise stable',
  mur: 'Mur',
  elastique: 'Élastique',
  ballon: 'Ballon',
  coussin: 'Coussin',
  petits_poids: 'Petits poids ou bouteilles d\'eau',
  step: 'Step ou marche',
  tapis: 'Tapis',
};

const arrondir5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

function texteVolume(series: number, repetitions: number | null, duree: number | null): string {
  if (repetitions != null) return `${series} série${series > 1 ? 's' : ''} de ${repetitions} répétitions`;
  return `${series} série${series > 1 ? 's' : ''} de ${duree} secondes`;
}

function construire(d: Definition): Exercice {
  const reps = d.repetitions ?? null;
  const duree = reps == null ? (d.duree ?? 30) : null;
  const n1 = {
    series: Math.max(1, d.series - 1),
    repetitions: reps != null ? Math.max(4, Math.round(reps * 0.7)) : null,
    duree_secondes: duree != null ? arrondir5(duree * 0.7) : null,
  };
  const n3 = {
    series: d.series + 1,
    repetitions: reps != null ? Math.round(reps * 1.3) : null,
    duree_secondes: duree != null ? arrondir5(duree * 1.4) : null,
  };
  const niveau = (v: typeof n1, description: string): NiveauConfig => ({ ...v, description, conseil: d.securite });
  const materiels = d.materiels ?? ['aucun'];
  const totalSec = d.series * (reps != null ? reps * 4 : (duree ?? 30)) + (d.series - 1) * 45;

  return {
    id: d.id,
    nom: d.nom,
    categorie: d.categorie,
    description: d.description,
    consigneSecurite: d.securite,
    niveaux: {
      debutant: `${texteVolume(n1.series, n1.repetitions, n1.duree_secondes)}${d.facile ? ` — ${d.facile}` : ''}`,
      intermediaire: texteVolume(d.series, reps, duree),
      avance: `${texteVolume(n3.series, n3.repetitions, n3.duree_secondes)}${d.difficile ? ` — ${d.difficile}` : ''}`,
    },
    materielNecessaire: materiels.map(m => LIBELLE_MATERIEL[m]).join(', '),
    dureeEstimeeMinutes: Math.min(10, Math.max(2, Math.ceil(totalSec / 60))),
    positionRequise: d.position,
    niveau_config: {
      '1': niveau(n1, d.facile ?? 'Amplitude réduite, rythme lent'),
      '2': niveau({ series: d.series, repetitions: reps, duree_secondes: duree }, 'Version de référence'),
      '3': niveau(n3, d.difficile ?? 'Amplitude complète, contrôle accru'),
    },
    familles: d.familles,
    materiels,
    objectif: d.objectif,
    respiration: d.respiration,
    varianteFacile: d.facile,
    varianteDifficile: d.difficile,
    horsCatalogueIA: true,
  };
}

const DEFINITIONS: Definition[] = [
  // ── MEMBRES INFÉRIEURS ──────────────────────────────────────────────────────
  {
    id: 'ma-flexion-genou-assis', nom: 'Flexion de genou assis', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['chaise'], objectif: 'Renforcer l\'arrière de la cuisse',
    description: 'Assis au bord de la chaise, pied à plat. Glisser le pied vers l\'arrière sous la chaise en pliant le genou, puis revenir.',
    securite: 'Rester assis au fond du siège si l\'équilibre est fragile ; mouvement sans à-coup.',
    facile: 'Petite amplitude', difficile: 'Avec élastique autour de la cheville', series: 3, repetitions: 10,
  },
  {
    id: 'ma-flexion-hanche-assise', nom: 'Montée de genou assis (flexion de hanche)', categorie: 'force', familles: ['renforcement', 'cardio'],
    position: 'assis', materiels: ['chaise'], objectif: 'Renforcer les fléchisseurs de hanche, préparer la marche',
    description: 'Assis, dos droit, mains sur les côtés de la chaise. Monter un genou vers la poitrine, reposer le pied, alterner. Plus vite, l\'exercice devient cardio.',
    securite: 'Ne pas s\'affaisser vers l\'arrière ; garder les deux mains en appui si besoin.',
    facile: 'Lever le pied de quelques centimètres', difficile: 'Rythme soutenu, bras qui accompagnent', series: 3, repetitions: 12,
  },
  {
    id: 'ma-abduction-genoux-elastique', nom: 'Abduction des genoux avec élastique', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['chaise', 'elastique'], objectif: 'Renforcer les abducteurs (stabilité du bassin)',
    description: 'Assis, élastique noué autour des cuisses au-dessus des genoux. Écarter les genoux contre la résistance, tenir une seconde, revenir lentement.',
    securite: 'Élastique au-dessus des genoux, jamais sur l\'articulation.',
    facile: 'Sans élastique, mains sur l\'extérieur des genoux', difficile: 'Élastique plus résistant', series: 3, repetitions: 12,
  },
  {
    id: 'ma-adduction-ballon', nom: 'Adduction avec ballon ou coussin', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['chaise', 'ballon', 'coussin'], objectif: 'Renforcer les adducteurs',
    description: 'Assis, un ballon souple ou un coussin entre les genoux. Serrer 5 secondes, relâcher doucement.',
    securite: 'Contraction progressive ; ne pas bloquer la respiration pendant le serrage.',
    facile: 'Serrage léger', difficile: 'Serrage de 8 secondes', series: 3, repetitions: 10,
  },
  {
    id: 'ma-talons-pointes-assis', nom: 'Talons-pointes assis', categorie: 'mobilite', familles: ['mobilite', 'renforcement'],
    position: 'assis', materiels: ['chaise'], objectif: 'Mobiliser les chevilles, activer la circulation',
    description: 'Assis, pieds à plat. Lever les talons (pointes au sol), reposer, puis lever les pointes (talons au sol). Alterner en rythme.',
    securite: 'Mouvement fluide, sans douleur.',
    facile: 'Une jambe à la fois', difficile: 'Rythme rapide pendant 45 secondes', series: 2, repetitions: 15,
  },
  {
    id: 'ma-elevation-talons-assis', nom: 'Élévation des talons assis', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['chaise', 'petits_poids'], objectif: 'Renforcer les mollets',
    description: `Assis, pieds à plat. Monter les talons le plus haut possible, tenir une seconde, redescendre lentement. ${NOTE_POIDS} (posées sur les cuisses).`,
    securite: 'Ne pas forcer en cas de crampe ; relâcher et masser.',
    facile: 'Sans charge', difficile: 'Charge posée sur les genoux', series: 3, repetitions: 15,
  },
  {
    id: 'ma-squat-chaise', nom: 'Squat avec chaise', categorie: 'force', familles: ['renforcement'],
    position: 'debout', materiels: ['chaise'], objectif: 'Renforcer cuisses et fessiers (fonction lever)',
    description: 'Debout devant une chaise, pieds largeur de hanches. Descendre les fesses jusqu\'à effleurer l\'assise, puis remonter sans s\'asseoir.',
    securite: 'Genoux dans l\'axe des pieds ; chaise calée contre un mur.',
    facile: 'S\'asseoir franchement entre chaque répétition', difficile: 'Tenir 2 secondes en bas', series: 3, repetitions: 10,
  },
  {
    id: 'ma-pas-lateraux', nom: 'Pas latéraux', categorie: 'endurance', familles: ['cardio', 'renforcement', 'equilibre'],
    position: 'debout', objectif: 'Renforcer les hanches, travailler les déplacements latéraux',
    description: 'Debout, faire des pas chassés sur le côté (pied qui s\'écarte, l\'autre qui rejoint), aller-retour.',
    securite: 'Espace dégagé ; longer un mur ou un plan de travail si l\'équilibre est fragile.',
    facile: 'Petits pas en longeant un appui', difficile: 'Genoux légèrement fléchis tout le long', series: 2, repetitions: 10,
  },
  {
    id: 'ma-pas-lateraux-elastique', nom: 'Pas latéraux avec élastique', categorie: 'force', familles: ['renforcement'],
    position: 'debout', materiels: ['elastique'], objectif: 'Renforcer les abducteurs de hanche',
    description: 'Élastique autour des chevilles ou au-dessus des genoux. Faire des pas latéraux en gardant l\'élastique tendu.',
    securite: 'Appui à proximité ; arrêter si l\'élastique gêne la marche.',
    facile: 'Élastique au-dessus des genoux', difficile: 'Élastique aux chevilles', series: 2, repetitions: 10,
  },
  {
    id: 'ma-fente-arriere-assistee', nom: 'Fente arrière assistée', categorie: 'force', familles: ['renforcement', 'equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Renforcer les jambes en appui dissocié',
    description: 'Debout, une main sur le dossier d\'une chaise. Reculer une jambe et fléchir légèrement les deux genoux, puis revenir. Alterner.',
    securite: 'Petite amplitude ; le genou avant reste au-dessus de la cheville.',
    facile: 'Deux mains sur l\'appui, petit pas', difficile: 'Descente plus profonde', series: 2, repetitions: 8,
  },
  {
    id: 'ma-clam', nom: 'Clam (coquillage)', categorie: 'force', familles: ['renforcement', 'pilates'],
    position: 'couche', materiels: ['tapis'], objectif: 'Renforcer les fessiers profonds',
    description: 'Allongé sur le côté, genoux fléchis, pieds joints. Ouvrir le genou du dessus comme un coquillage, sans bouger le bassin, refermer lentement.',
    securite: 'Coussin sous la tête ; éviter en cas de prothèse de hanche récente sans avis médical.',
    respiration: RESPIRATION_PILATES, facile: 'Petite ouverture', difficile: 'Élastique au-dessus des genoux', series: 2, repetitions: 10,
  },
  {
    id: 'ma-pression-pieds-sol', nom: 'Pression des pieds dans le sol', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['chaise'], objectif: 'Renforcement isométrique des jambes, préparation au lever',
    description: 'Assis, pieds à plat. Pousser fort les pieds dans le sol comme pour se lever, tenir 5 secondes, relâcher.',
    securite: 'Expirer pendant la poussée, ne pas retenir la respiration.',
    facile: 'Poussée légère, 3 secondes', difficile: 'Tenir 8 secondes', series: 3, repetitions: 8,
  },

  // ── HAUT DU CORPS ───────────────────────────────────────────────────────────
  {
    id: 'ma-curl-biceps', nom: 'Curl biceps', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['petits_poids'], objectif: 'Renforcer les fléchisseurs du coude (porter)',
    description: `Assis ou debout, coudes le long du corps, paumes vers le haut. Plier les coudes pour monter les poids, redescendre lentement. ${NOTE_POIDS}`,
    securite: 'Coudes fixes contre le corps ; ne pas cambrer.',
    facile: 'Sans charge', difficile: 'Descente lente sur 3 secondes', series: 3, repetitions: 12,
  },
  {
    id: 'ma-curl-marteau', nom: 'Curl marteau', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['petits_poids'], objectif: 'Renforcer avant-bras et biceps',
    description: `Comme le curl biceps, mais paumes face à face (prise « marteau »). ${NOTE_POIDS}`,
    securite: 'Poignets alignés avec l\'avant-bras.',
    facile: 'Sans charge', difficile: 'Alterner les bras, tempo lent', series: 3, repetitions: 12,
  },
  {
    id: 'ma-extension-triceps', nom: 'Extension triceps', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['petits_poids'], objectif: 'Renforcer l\'arrière du bras (se relever en poussant)',
    description: `Assis, tenir un poids à deux mains derrière la tête, coudes vers le plafond. Tendre les bras vers le haut, redescendre lentement. ${NOTE_POIDS}`,
    securite: 'Éviter en cas de douleur d\'épaule : faire la variante facile.',
    facile: 'Assis, pousser les mains sur les accoudoirs pour soulever légèrement les fesses', difficile: 'Un bras à la fois', series: 3, repetitions: 10,
  },
  {
    id: 'ma-tirage-coudes-serres', nom: 'Tirage coudes serrés avec élastique', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['elastique'], objectif: 'Renforcer le dos, améliorer la posture',
    description: 'Élastique fixé devant soi (ou autour des pieds, assis). Tirer les mains vers les hanches en gardant les coudes serrés contre le corps, omoplates rapprochées.',
    securite: 'Vérifier l\'élastique et son point d\'attache avant chaque séance.',
    facile: 'Élastique peu tendu', difficile: 'Tenir 2 secondes en fin de tirage', series: 3, repetitions: 12,
  },
  {
    id: 'ma-developpe-poitrine-elastique', nom: 'Développé poitrine avec élastique', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['elastique'], objectif: 'Renforcer pectoraux et triceps (pousser)',
    description: 'Élastique passé dans le dos, une extrémité dans chaque main. Pousser les mains devant soi jusqu\'à bras tendus, revenir lentement.',
    securite: 'Ne pas verrouiller les coudes ; dos contre le dossier si assis.',
    facile: 'Élastique souple', difficile: 'Élastique plus résistant', series: 3, repetitions: 12,
  },
  {
    id: 'ma-serrage-ballon-poitrine', nom: 'Serrage de ballon devant la poitrine', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['ballon'], objectif: 'Renforcement isométrique des pectoraux',
    description: 'Tenir un ballon souple à hauteur de poitrine, coudes écartés. Presser le ballon 5 secondes entre les paumes, relâcher.',
    securite: 'Expirer pendant la pression.',
    facile: 'Pression légère', difficile: 'Presser en tendant progressivement les bras', series: 3, repetitions: 8,
  },
  {
    id: 'ma-pompes-mur', nom: 'Pompes contre un mur', categorie: 'force', familles: ['renforcement'],
    position: 'debout', materiels: ['mur'], objectif: 'Renforcer pectoraux, épaules, triceps',
    description: 'Debout face au mur, mains à plat à hauteur d\'épaules. Fléchir les coudes pour approcher le buste du mur, repousser.',
    securite: 'Pieds proches du mur pour commencer ; corps aligné, sans creuser le dos.',
    facile: 'Pieds très proches du mur', difficile: 'Pieds plus éloignés', series: 3, repetitions: 10,
  },
  {
    id: 'ma-elevations-laterales', nom: 'Élévations latérales', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['petits_poids'], objectif: 'Renforcer les épaules',
    description: `Bras le long du corps, lever les bras sur les côtés jusqu'à hauteur d'épaules, redescendre lentement. ${NOTE_POIDS}`,
    securite: 'Ne pas dépasser l\'horizontale ; arrêter en cas de douleur d\'épaule.',
    facile: 'Sans charge, coudes pliés', difficile: 'Tenir 2 secondes en haut', series: 3, repetitions: 10,
  },
  {
    id: 'ma-rotation-externe-elastique', nom: 'Rotation externe d\'épaules avec élastique', categorie: 'force', familles: ['renforcement'],
    position: 'tous', materiels: ['elastique'], objectif: 'Renforcer la coiffe des rotateurs',
    description: 'Coudes au corps pliés à 90°, élastique entre les mains. Écarter les avant-bras vers l\'extérieur, coudes collés, revenir lentement.',
    securite: 'Petite amplitude, sans douleur.',
    facile: 'Sans élastique', difficile: 'Élastique plus résistant', series: 3, repetitions: 12,
  },
  {
    id: 'ma-retraction-omoplates', nom: 'Rétraction des omoplates', categorie: 'force', familles: ['renforcement', 'mobilite'],
    position: 'tous', objectif: 'Posture, ouverture des épaules',
    description: 'Assis ou debout, bras le long du corps. Rapprocher les omoplates comme pour pincer un crayon entre elles, tenir 3 secondes, relâcher.',
    securite: 'Ne pas hausser les épaules ; menton rentré.',
    facile: 'Tenir 2 secondes', difficile: 'Avec élastique tendu devant soi', series: 2, repetitions: 10,
  },
  {
    id: 'ma-ouverture-bras', nom: 'Ouverture des bras', categorie: 'force', familles: ['renforcement', 'mobilite'],
    position: 'tous', materiels: ['elastique'], objectif: 'Renforcer le haut du dos, ouvrir la poitrine',
    description: 'Bras tendus devant soi à hauteur d\'épaules, élastique entre les mains. Ouvrir les bras sur les côtés en écartant l\'élastique, revenir lentement.',
    securite: 'Coudes légèrement fléchis ; ne pas cambrer.',
    facile: 'Sans élastique', difficile: 'Tenir l\'ouverture 2 secondes', series: 3, repetitions: 12,
  },
  {
    id: 'ma-wall-angel', nom: 'Wall angel (anges au mur)', categorie: 'mobilite', familles: ['renforcement', 'mobilite'],
    position: 'debout', materiels: ['mur'], objectif: 'Posture, mobilité des épaules',
    description: 'Dos contre le mur, bras en « chandelier » (coudes à 90°) contre le mur. Faire glisser les bras vers le haut puis redescendre, en gardant le contact.',
    securite: 'Amplitude limitée à ce qui est confortable ; ne pas forcer les épaules.',
    facile: 'Petite amplitude', difficile: 'Mouvement très lent', series: 2, repetitions: 8,
  },
  {
    id: 'ma-flexion-poignets', nom: 'Flexion des poignets', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['petits_poids'], objectif: 'Renforcer la préhension',
    description: `Assis, avant-bras posé sur la cuisse, paume vers le haut, un petit poids en main. Monter le poignet, redescendre lentement. ${NOTE_POIDS}`,
    securite: 'Charge très légère ; arrêter en cas de douleur du poignet.',
    facile: 'Sans charge', difficile: 'Tempo lent', series: 2, repetitions: 12,
  },
  {
    id: 'ma-extension-poignets', nom: 'Extension des poignets', categorie: 'force', familles: ['renforcement'],
    position: 'assis', materiels: ['petits_poids'], objectif: 'Renforcer les extenseurs du poignet',
    description: `Même position que la flexion, paume vers le bas. Relever le dos de la main, redescendre lentement. ${NOTE_POIDS}`,
    securite: 'Charge très légère ; mouvement sans à-coup.',
    facile: 'Sans charge', difficile: 'Tempo lent', series: 2, repetitions: 12,
  },
  {
    id: 'ma-auto-grandissement', nom: 'Auto-grandissement', categorie: 'force', familles: ['renforcement', 'pilates'],
    position: 'tous', objectif: 'Posture, conscience de l\'axe du corps',
    description: 'Assis ou debout, imaginer un fil qui tire le sommet du crâne vers le plafond. S\'allonger vers le haut sans lever les épaules, tenir, relâcher.',
    securite: 'Menton légèrement rentré, épaules basses.',
    respiration: RESPIRATION_PILATES, facile: 'Tenir 5 secondes', difficile: 'Tenir 15 secondes en respirant', series: 2, repetitions: 6,
  },
  {
    id: 'ma-retraction-cervicale', nom: 'Rétraction cervicale douce', categorie: 'mobilite', familles: ['mobilite', 'renforcement'],
    position: 'tous', objectif: 'Posture de la tête et du cou',
    description: 'Regard droit devant, reculer doucement la tête à l\'horizontale (« double menton »), tenir 3 secondes, relâcher.',
    securite: 'Mouvement très doux ; ne jamais forcer en cas de vertige.',
    facile: 'Petite amplitude', difficile: 'Dos contre le mur', series: 2, repetitions: 8,
  },

  // ── MOBILITÉ ────────────────────────────────────────────────────────────────
  {
    id: 'ma-cervicale-flexion', nom: 'Flexion-extension cervicale douce', categorie: 'mobilite', familles: ['mobilite'],
    position: 'tous', objectif: 'Mobilité du cou',
    description: 'Assis, dos droit. Baisser lentement le menton vers la poitrine, revenir, puis regarder légèrement vers le haut.',
    securite: 'Petite amplitude vers l\'arrière ; arrêter en cas de vertige.',
    facile: 'Flexion seulement', difficile: 'Mouvement plus ample et lent', series: 2, repetitions: 6,
  },
  {
    id: 'ma-cervicale-rotation', nom: 'Rotation cervicale', categorie: 'mobilite', familles: ['mobilite'],
    position: 'tous', objectif: 'Mobilité du cou (regarder sur le côté)',
    description: 'Tourner lentement la tête vers la droite comme pour regarder par-dessus l\'épaule, revenir, puis à gauche.',
    securite: 'Lentement, sans à-coup ; arrêter en cas de vertige.',
    facile: 'Petite amplitude', difficile: 'Tenir 2 secondes de chaque côté', series: 2, repetitions: 6,
  },
  {
    id: 'ma-cervicale-inclinaison', nom: 'Inclinaison cervicale', categorie: 'mobilite', familles: ['mobilite', 'souplesse'],
    position: 'tous', objectif: 'Mobilité et détente du cou',
    description: 'Incliner l\'oreille vers l\'épaule sans lever l\'épaule, revenir, puis de l\'autre côté.',
    securite: 'Ne pas tirer sur la tête avec la main.',
    facile: 'Petite amplitude', difficile: 'Tenir 10 secondes de chaque côté', series: 2, repetitions: 6,
  },
  {
    id: 'ma-haussement-epaules', nom: 'Élévation-abaissement des épaules', categorie: 'mobilite', familles: ['mobilite', 'recuperation'],
    position: 'tous', objectif: 'Détendre les trapèzes',
    description: 'Monter les épaules vers les oreilles en inspirant, les laisser redescendre en expirant.',
    securite: 'Mouvement relâché, sans crispation.',
    facile: 'Amplitude réduite', difficile: 'Tenir 3 secondes en haut', series: 2, repetitions: 8,
  },
  {
    id: 'ma-flexion-epaules', nom: 'Flexion des épaules', categorie: 'mobilite', familles: ['mobilite'],
    position: 'tous', objectif: 'Lever les bras (s\'habiller, attraper en hauteur)',
    description: 'Bras le long du corps, lever les bras tendus devant soi aussi haut que possible, redescendre lentement.',
    securite: 'S\'arrêter avant la douleur ; dos droit.',
    facile: 'Un bras à la fois, jusqu\'à l\'horizontale', difficile: 'Jusqu\'à la verticale, tempo lent', series: 2, repetitions: 8,
  },
  {
    id: 'ma-abduction-epaules', nom: 'Abduction des épaules', categorie: 'mobilite', familles: ['mobilite'],
    position: 'tous', objectif: 'Mobilité des épaules sur le côté',
    description: 'Lever les bras sur les côtés, paumes vers le haut, aussi haut que confortable, redescendre lentement.',
    securite: 'Pas de douleur ; ne pas hausser les épaules.',
    facile: 'Jusqu\'à hauteur d\'épaules', difficile: 'Jusqu\'au-dessus de la tête', series: 2, repetitions: 8,
  },
  {
    id: 'ma-inclinaison-tronc', nom: 'Inclinaison latérale du tronc', categorie: 'mobilite', familles: ['mobilite', 'souplesse'],
    position: 'tous', objectif: 'Mobilité et étirement des flancs',
    description: 'Assis ou debout, une main sur la hanche. Lever l\'autre bras et s\'incliner doucement sur le côté, revenir, changer de côté.',
    securite: 'Ne pas se pencher en avant ; les fesses restent sur la chaise.',
    facile: 'Bras le long du corps, glisser la main vers le sol', difficile: 'Tenir 10 secondes en respirant', series: 2, repetitions: 6,
  },
  {
    id: 'ma-bascule-bassin', nom: 'Bascule du bassin', categorie: 'mobilite', familles: ['mobilite', 'pilates'],
    position: 'tous', materiels: ['chaise', 'tapis'], objectif: 'Mobilité du bas du dos, conscience du bassin',
    description: 'Assis (ou allongé genoux fléchis), basculer le bassin vers l\'arrière en arrondissant le bas du dos, puis vers l\'avant en le creusant légèrement.',
    securite: 'Petite amplitude, sans douleur lombaire.',
    respiration: RESPIRATION_PILATES, facile: 'Très petite amplitude', difficile: 'Ralentir et marquer chaque position', series: 2, repetitions: 10,
  },
  {
    id: 'ma-cercles-bassin', nom: 'Cercles du bassin', categorie: 'mobilite', familles: ['mobilite'],
    position: 'tous', materiels: ['chaise'], objectif: 'Mobilité du bassin et du bas du dos',
    description: 'Assis au bord de la chaise (ou debout, mains sur les hanches), dessiner des cercles avec le bassin, dans un sens puis dans l\'autre.',
    securite: 'Debout : rester près d\'un appui.',
    facile: 'Petits cercles assis', difficile: 'Grands cercles debout', series: 2, repetitions: 8,
  },
  {
    id: 'ma-ouverture-hanche', nom: 'Ouverture de hanche assis', categorie: 'mobilite', familles: ['mobilite'],
    position: 'assis', materiels: ['chaise'], objectif: 'Mobilité de hanche',
    description: 'Assis, laisser un genou s\'ouvrir lentement vers l\'extérieur (pied qui reste au sol), puis revenir.',
    securite: 'Prothèse de hanche : respecter les consignes du chirurgien sur les amplitudes.',
    facile: 'Petite ouverture', difficile: 'Plus grande ouverture, retour lent', series: 2, repetitions: 10,
  },
  {
    id: 'ma-rotation-hanche', nom: 'Rotation de hanche assis', categorie: 'mobilite', familles: ['mobilite'],
    position: 'assis', materiels: ['chaise'], objectif: 'Mobilité de hanche en rotation',
    description: 'Assis, genou fixe, faire balayer le pied vers l\'intérieur puis vers l\'extérieur comme un essuie-glace.',
    securite: 'Prothèse de hanche : respecter les amplitudes autorisées.',
    facile: 'Petite amplitude', difficile: 'Amplitude complète lente', series: 2, repetitions: 10,
  },

  // ── SOUPLESSE ───────────────────────────────────────────────────────────────
  {
    id: 'ma-etirement-adducteurs', nom: 'Étirement des adducteurs', categorie: 'souplesse', familles: ['souplesse', 'recuperation'],
    position: 'assis', materiels: ['chaise'], objectif: 'Souplesse de l\'intérieur des cuisses',
    description: 'Assis au bord de la chaise, jambes écartées, pieds à plat. Pousser doucement les genoux vers l\'extérieur avec les mains.',
    securite: 'Étirement doux, jamais douloureux ; respirer calmement.',
    facile: 'Écartement réduit', difficile: 'Buste légèrement penché en avant', series: 2, duree: 25,
  },
  {
    id: 'ma-etirement-fessiers', nom: 'Étirement des fessiers assis', categorie: 'souplesse', familles: ['souplesse', 'recuperation'],
    position: 'assis', materiels: ['chaise'], objectif: 'Souplesse des fessiers',
    description: 'Assis, poser la cheville sur le genou opposé (ou rapprocher le genou de la poitrine avec les mains), dos droit, se pencher légèrement en avant.',
    securite: 'Prothèse de hanche : éviter le croisement, utiliser la variante genou-poitrine.',
    facile: 'Genou vers la poitrine', difficile: 'Cheville sur le genou opposé', series: 2, duree: 25,
  },
  {
    id: 'ma-etirement-flechisseurs', nom: 'Étirement des fléchisseurs de hanche', categorie: 'souplesse', familles: ['souplesse'],
    position: 'debout', materiels: ['chaise'], objectif: 'Souplesse de l\'avant de la hanche',
    description: 'Debout, une main sur le dossier de la chaise, une jambe en arrière en petite fente. Rentrer légèrement le bassin pour sentir l\'étirement à l\'avant de la hanche arrière.',
    securite: 'Garder l\'appui ; ne pas cambrer le dos.',
    facile: 'Petit pas en arrière', difficile: 'Bras du côté étiré levé', series: 2, duree: 25,
  },
  {
    id: 'ma-etirement-pectoraux', nom: 'Étirement des pectoraux contre un mur', categorie: 'souplesse', familles: ['souplesse'],
    position: 'debout', materiels: ['mur'], objectif: 'Ouvrir la poitrine (posture)',
    description: 'Avant-bras posé contre un mur ou un encadrement de porte, coude à hauteur d\'épaule. Tourner doucement le buste à l\'opposé.',
    securite: 'Étirement léger ; aucune douleur d\'épaule.',
    facile: 'Main plus basse', difficile: 'Coude légèrement plus haut', series: 2, duree: 25,
  },
  {
    id: 'ma-etirement-deltoide', nom: 'Étirement du deltoïde postérieur', categorie: 'souplesse', familles: ['souplesse', 'recuperation'],
    position: 'tous', objectif: 'Souplesse de l\'arrière de l\'épaule',
    description: 'Amener un bras tendu devant la poitrine et le rapprocher doucement avec l\'autre main, au niveau du coude.',
    securite: 'Ne pas appuyer sur l\'articulation du coude.',
    facile: 'Petite amplitude', difficile: 'Tenir 30 secondes', series: 2, duree: 20,
  },
  {
    id: 'ma-etirement-triceps', nom: 'Étirement du triceps', categorie: 'souplesse', familles: ['souplesse', 'recuperation'],
    position: 'tous', objectif: 'Souplesse de l\'arrière du bras',
    description: 'Lever un bras, plier le coude pour poser la main dans le dos, l\'autre main accompagne doucement le coude.',
    securite: 'À éviter en cas de douleur d\'épaule ; faire la variante facile.',
    facile: 'Main sur l\'épaule, coude vers l\'avant', difficile: 'Tenir 30 secondes', series: 2, duree: 20,
  },
  {
    id: 'ma-etirement-grand-dorsal', nom: 'Étirement du grand dorsal', categorie: 'souplesse', familles: ['souplesse'],
    position: 'tous', objectif: 'Souplesse des flancs et du dos',
    description: 'Mains jointes au-dessus de la tête (ou une main sur l\'autre poignet), s\'étirer vers le haut puis légèrement sur le côté.',
    securite: 'Épaules basses ; amplitude confortable.',
    facile: 'Bras à hauteur de visage', difficile: 'Inclinaison plus marquée', series: 2, duree: 20,
  },
  {
    id: 'ma-ouverture-thoracique', nom: 'Ouverture thoracique', categorie: 'souplesse', familles: ['souplesse', 'mobilite'],
    position: 'tous', materiels: ['chaise'], objectif: 'Redresser le haut du dos',
    description: 'Assis, mains derrière la tête, coudes ouverts. Inspirer en ouvrant les coudes et en grandissant le buste, expirer en revenant.',
    securite: 'Ne pas tirer sur la nuque.',
    facile: 'Mains sur les épaules', difficile: 'Contre le dossier, légère extension', series: 2, repetitions: 8,
  },

  // ── CARDIO / ENDURANCE ──────────────────────────────────────────────────────
  {
    id: 'ma-marche-assise', nom: 'Marche assise', categorie: 'endurance', familles: ['cardio'],
    position: 'assis', materiels: ['chaise'], objectif: 'Endurance sans impact',
    description: 'Assis, dos droit, lever les pieds alternativement comme pour marcher, en balançant les bras.',
    securite: 'Pouvoir parler pendant l\'exercice ; ralentir en cas d\'essoufflement.',
    facile: 'Sans les bras', difficile: 'Rythme plus soutenu', series: 2, duree: 60,
  },
  {
    id: 'ma-marche-assise-dynamique', nom: 'Marche assise dynamique', categorie: 'endurance', familles: ['cardio'],
    position: 'assis', materiels: ['chaise'], objectif: 'Élever la fréquence cardiaque assis',
    description: 'Marche assise rapide, genoux plus hauts, bras qui poussent vers le haut ou vers l\'avant.',
    securite: 'Échelle d\'effort : rester « modéré » ; ralentir si besoin.',
    facile: 'Bras le long du corps', difficile: 'Fractionné 30 s rapide / 30 s lent', series: 3, duree: 60,
  },
  {
    id: 'ma-talons-alternes', nom: 'Talons alternés devant', categorie: 'endurance', familles: ['cardio'],
    position: 'assis', materiels: ['chaise'], objectif: 'Endurance et coordination',
    description: 'Assis, poser alternativement un talon devant soi puis revenir, en rythme, bras qui accompagnent.',
    securite: 'Rester bien assis au fond de la chaise.',
    facile: 'Lentement', difficile: 'Rythme soutenu avec bras opposé tendu', series: 2, duree: 45,
  },
  {
    id: 'ma-step-touch-assis', nom: 'Step-touch assis', categorie: 'endurance', familles: ['cardio'],
    position: 'assis', materiels: ['chaise'], objectif: 'Endurance assis',
    description: 'Assis, écarter un pied sur le côté puis le ramener, alterner droite-gauche en rythme, bras qui s\'ouvrent.',
    securite: 'Chaise stable, sans roulettes.',
    facile: 'Sans les bras', difficile: 'Ouvrir les bras au-dessus de la tête', series: 2, duree: 45,
  },
  {
    id: 'ma-boxe-assise', nom: 'Boxe dans le vide assise', categorie: 'endurance', familles: ['cardio', 'coordination'],
    position: 'assis', materiels: ['chaise'], objectif: 'Endurance du haut du corps, coordination',
    description: 'Assis, donner des coups de poing alternés vers l\'avant, puis vers le haut, sans tendre complètement les coudes.',
    securite: 'Ne pas verrouiller les coudes ; dos droit.',
    facile: 'Lentement, vers l\'avant seulement', difficile: 'Enchaîner avant, haut, côté', series: 3, duree: 30,
  },
  {
    id: 'ma-marche-dynamique', nom: 'Marche dynamique', categorie: 'endurance', familles: ['cardio'],
    position: 'debout', objectif: 'Endurance à la marche',
    description: 'Marcher d\'un bon pas (couloir, extérieur), bras qui balancent, en restant capable de parler.',
    securite: 'Chaussures adaptées, parcours sans obstacle.',
    facile: 'Allure confortable', difficile: 'Petites accélérations', series: 1, duree: 300,
  },
  {
    id: 'ma-step-touch-debout', nom: 'Step-touch debout', categorie: 'endurance', familles: ['cardio', 'coordination'],
    position: 'debout', objectif: 'Endurance sans impact',
    description: 'Debout, pas sur le côté puis l\'autre pied rejoint, en rythme, bras qui accompagnent.',
    securite: 'Appui à proximité.',
    facile: 'Sans les bras', difficile: 'Bras au-dessus de la tête', series: 2, duree: 60,
  },
  {
    id: 'ma-talons-fesses', nom: 'Talons-fesses adaptés', categorie: 'endurance', familles: ['cardio'],
    position: 'debout', materiels: ['chaise'], objectif: 'Endurance, activation des ischio-jambiers',
    description: 'Debout, mains sur le dossier de la chaise, ramener alternativement un talon vers la fesse.',
    securite: 'Garder l\'appui ; amplitude confortable.',
    facile: 'Lentement', difficile: 'Rythme plus rapide', series: 2, duree: 45,
  },
  {
    id: 'ma-marche-avant-arriere', nom: 'Marche avant-arrière', categorie: 'endurance', familles: ['cardio', 'equilibre'],
    position: 'debout', objectif: 'Endurance et changements de direction',
    description: 'Faire 4 pas en avant, puis 4 pas en arrière, de façon continue.',
    securite: 'Espace dégagé ; regarder derrière soi si besoin ; appui le long d\'un mur.',
    facile: '2 pas seulement', difficile: 'Sans appui, rythme soutenu', series: 2, duree: 60,
  },
  {
    id: 'ma-pointes-alternees', nom: 'Pointes de pied alternées devant', categorie: 'endurance', familles: ['cardio', 'equilibre'],
    position: 'debout', objectif: 'Endurance et transfert d\'appui',
    description: 'Debout, poser alternativement la pointe d\'un pied devant soi puis revenir, en rythme.',
    securite: 'Appui à proximité.',
    facile: 'Main sur un appui', difficile: 'Pointe sur le côté et derrière en plus', series: 2, duree: 45,
  },

  // ── ÉQUILIBRE ───────────────────────────────────────────────────────────────
  {
    id: 'ma-transfert-avant-arriere', nom: 'Transfert de poids avant-arrière', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Contrôle de l\'équilibre dans l\'axe',
    description: 'Debout, un pied légèrement devant l\'autre. Transférer le poids sur le pied avant, puis sur le pied arrière, lentement.',
    securite: 'Chaise ou plan de travail à portée de main.',
    facile: 'Mains sur l\'appui', difficile: 'Sans appui', series: 2, duree: 30,
  },
  {
    id: 'ma-pieds-rapproches', nom: 'Station pieds rapprochés', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Équilibre statique',
    description: 'Debout, pieds serrés l\'un contre l\'autre, regard fixe devant soi. Tenir la position.',
    securite: 'Appui à portée de main, présence de l\'enseignant au début.',
    facile: 'Une main sur l\'appui', difficile: 'Tourner la tête lentement', series: 3, duree: 20,
  },
  {
    id: 'ma-semi-tandem', nom: 'Position semi-tandem', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Équilibre statique (étape vers le tandem)',
    description: 'Debout, placer le talon d\'un pied au niveau du milieu de l\'autre pied, un peu décalé. Tenir, puis changer de pied.',
    securite: 'Appui à portée de main.',
    facile: 'Une main sur l\'appui', difficile: 'Sans appui', series: 2, duree: 20,
  },
  {
    id: 'ma-lever-pied', nom: 'Lever alternativement un pied', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Appui unipodal bref et contrôlé',
    description: 'Debout près d\'un appui, lever un pied de quelques centimètres 3 secondes, reposer, changer de pied.',
    securite: 'Appui à portée de main ; arrêter en cas de vertige.',
    facile: 'Deux mains sur l\'appui', difficile: 'Sans appui, 5 secondes', series: 2, repetitions: 8,
  },
  {
    id: 'ma-pas-lateraux-appui', nom: 'Pas latéraux avec appui', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Équilibre dynamique latéral sécurisé',
    description: 'Face à un plan de travail ou un mur, mains en appui, faire des pas sur le côté en longeant l\'appui.',
    securite: 'Garder au moins une main en appui.',
    facile: 'Deux mains en appui', difficile: 'Une main, pas plus grands', series: 2, repetitions: 10,
  },
  {
    id: 'ma-marche-changement-direction', nom: 'Marche avec changements de direction', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', objectif: 'Équilibre dynamique, prévention des chutes',
    description: 'Marcher et changer de direction au signal (à droite, à gauche, demi-tour), sans s\'arrêter.',
    securite: 'Espace dégagé ; enseignant à côté.',
    facile: 'Changements annoncés à l\'avance', difficile: 'Signal surprise', series: 2, duree: 60,
  },
  {
    id: 'ma-marche-obstacles', nom: 'Marche autour d\'obstacles', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', objectif: 'Équilibre dynamique (slalom)',
    description: 'Contourner des plots ou des chaises disposés en slalom, en marchant.',
    securite: 'Obstacles stables et bien visibles.',
    facile: 'Obstacles espacés', difficile: 'Obstacles rapprochés', series: 2, repetitions: 3,
  },
  {
    id: 'ma-franchissement-obstacles', nom: 'Franchissement de petits obstacles', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', objectif: 'Lever le pied, prévenir les chutes par accrochage',
    description: 'Enjamber de petits obstacles (bâton au sol, serviette roulée) en marchant.',
    securite: 'Obstacles bas et non glissants ; appui à proximité.',
    facile: 'Obstacle plat (ligne au sol)', difficile: 'Obstacle un peu plus haut', series: 2, repetitions: 5,
  },
  {
    id: 'ma-step-avant-arriere', nom: 'Pas avant-arrière (step)', categorie: 'equilibre', familles: ['equilibre', 'cardio'],
    position: 'debout', objectif: 'Transfert d\'appui avant-arrière',
    description: 'Faire un pas en avant puis revenir, puis un pas en arrière et revenir, en alternant les jambes.',
    securite: 'Appui à proximité pour le pas arrière.',
    facile: 'Pas avant seulement', difficile: 'Sans appui, rythme continu', series: 2, repetitions: 8,
  },
  {
    id: 'ma-cibles-pied', nom: 'Cibles à toucher avec le pied', categorie: 'equilibre', familles: ['equilibre', 'coordination'],
    position: 'debout', materiels: ['chaise'], objectif: 'Équilibre et précision du pied',
    description: 'Des cibles au sol (feuilles de couleur) devant et sur les côtés. Toucher la cible annoncée avec la pointe du pied, revenir.',
    securite: 'Appui à portée de main.',
    facile: 'Cibles proches, avec appui', difficile: 'Cibles éloignées, sans appui', series: 2, repetitions: 8,
  },
  {
    id: 'ma-demi-tour', nom: 'Demi-tour contrôlé', categorie: 'equilibre', familles: ['equilibre'],
    position: 'debout', objectif: 'Se retourner sans perdre l\'équilibre',
    description: 'Debout, faire un demi-tour sur place en petits pas, s\'arrêter, puis repartir dans l\'autre sens.',
    securite: 'Petits pas, jamais en pivot sur un pied ; enseignant à côté.',
    facile: 'Lentement, avec appui', difficile: 'Plus rapide, sans appui', series: 2, repetitions: 4,
  },
  {
    id: 'ma-assis-debout-stabilisation', nom: 'Assis-debout avec stabilisation', categorie: 'equilibre', familles: ['equilibre', 'renforcement'],
    position: 'debout', materiels: ['chaise'], objectif: 'Se lever et se stabiliser avant de marcher',
    description: 'Se lever de la chaise, rester immobile 3 secondes bien stable, puis se rasseoir lentement.',
    securite: 'Chaise calée contre un mur ; s\'aider des mains si besoin.',
    facile: 'Avec les mains', difficile: 'Sans les mains, tenir 5 secondes', series: 2, repetitions: 6,
  },

  // ── COORDINATION / COGNITIF ─────────────────────────────────────────────────
  {
    id: 'ma-main-genou-oppose', nom: 'Main / genou opposé', categorie: 'memoire', familles: ['coordination'],
    position: 'tous', materiels: ['chaise'], objectif: 'Coordination croisée',
    description: 'Monter le genou gauche et le toucher avec la main droite, puis genou droit / main gauche. Assis ou debout.',
    securite: 'Debout : près d\'un appui.',
    facile: 'Assis, lentement', difficile: 'Debout, en rythme', series: 2, repetitions: 10,
  },
  {
    id: 'ma-bras-jambes-opposes', nom: 'Bras et jambes opposés', categorie: 'memoire', familles: ['coordination'],
    position: 'tous', materiels: ['chaise'], objectif: 'Coordination croisée',
    description: 'Tendre le bras droit devant et la jambe gauche en même temps, revenir, puis l\'inverse.',
    securite: 'Debout : près d\'un appui.',
    facile: 'Assis, bras seulement puis jambes', difficile: 'Debout, enchaînement rapide', series: 2, repetitions: 10,
  },
  {
    id: 'ma-marche-bras', nom: 'Marche avec mouvements de bras', categorie: 'memoire', familles: ['coordination', 'cardio'],
    position: 'debout', objectif: 'Coordination pendant la marche',
    description: 'Marcher sur place ou en avant en ajoutant un mouvement de bras (devant, haut, côtés) qui change toutes les 8 pas.',
    securite: 'Espace dégagé.',
    facile: 'Un seul mouvement de bras', difficile: 'Changement au signal', series: 2, duree: 60,
  },
  {
    id: 'ma-parties-corps', nom: 'Parties du corps sur consigne', categorie: 'memoire', familles: ['coordination', 'cognitif'],
    position: 'tous', objectif: 'Attention et vitesse de réaction',
    description: 'L\'enseignant annonce une partie du corps (genou, épaule, tête…), le bénéficiaire la touche le plus vite possible.',
    securite: 'Pas de précipitation qui ferait perdre l\'équilibre.',
    facile: 'Consignes lentes', difficile: 'Deux consignes enchaînées, main droite/gauche', series: 2, duree: 60,
  },
  {
    id: 'ma-ballon-mains', nom: 'Ballon main droite / main gauche', categorie: 'memoire', familles: ['coordination'],
    position: 'tous', materiels: ['ballon'], objectif: 'Coordination des mains',
    description: 'Faire passer un ballon d\'une main à l\'autre devant soi, puis autour de la taille, puis sous les genoux (assis).',
    securite: 'Assis si l\'équilibre est fragile.',
    facile: 'Passage devant soi', difficile: 'Petit lancer d\'une main à l\'autre', series: 2, duree: 45,
  },
  {
    id: 'ma-sequence-3-mouvements', nom: 'Séquence de 3 mouvements', categorie: 'memoire', familles: ['coordination', 'cognitif'],
    position: 'tous', objectif: 'Mémoire de travail et coordination',
    description: 'Apprendre une séquence de 3 mouvements (ex. : bras devant, genou levé, applaudir), puis la répéter de mémoire.',
    securite: 'Mouvements simples et sécurisés.',
    facile: 'Démonstration à chaque répétition', difficile: 'Répéter plus vite', series: 2, repetitions: 6,
  },
  {
    id: 'ma-sequence-4-mouvements', nom: 'Séquence de 4 mouvements', categorie: 'memoire', familles: ['coordination', 'cognitif'],
    position: 'tous', objectif: 'Mémoire de travail (niveau plus élevé)',
    description: 'Même principe avec 4 mouvements ; possibilité d\'inverser l\'ordre.',
    securite: 'Mouvements simples et sécurisés.',
    facile: 'Démonstration à chaque répétition', difficile: 'Séquence à l\'envers', series: 2, repetitions: 6,
  },
  {
    id: 'ma-marche-categories', nom: 'Marche et catégories de mots', categorie: 'memoire', familles: ['cognitif', 'cardio'],
    position: 'debout', objectif: 'Double tâche marche + langage',
    description: 'Marcher en citant des mots d\'une catégorie (fruits, prénoms, villes…) sans s\'arrêter.',
    securite: 'Si la marche se dégrade, ralentir ou s\'arrêter pour répondre.',
    facile: 'Marche sur place', difficile: 'Lettre imposée (fruits en P…)', series: 2, duree: 60,
  },
  {
    id: 'ma-transfert-cognitif', nom: 'Transfert de poids et tâche cognitive', categorie: 'memoire', familles: ['cognitif', 'equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Double tâche équilibre + attention',
    description: 'Transférer le poids d\'un pied sur l\'autre tout en comptant à rebours ou en citant les jours de la semaine à l\'envers.',
    securite: 'Appui à portée de main.',
    facile: 'Compter à l\'endroit', difficile: 'Compter de 3 en 3 à rebours', series: 2, duree: 45,
  },
  {
    id: 'ma-genoux-calcul', nom: 'Montées de genoux et calcul', categorie: 'memoire', familles: ['cognitif', 'cardio'],
    position: 'tous', materiels: ['chaise'], objectif: 'Double tâche effort + calcul',
    description: 'Montées de genoux (assis ou debout) en réalisant des additions simples annoncées par l\'enseignant.',
    securite: 'Assis si l\'équilibre est fragile.',
    facile: 'Assis, additions simples', difficile: 'Debout, soustractions', series: 2, duree: 45,
  },
  {
    id: 'ma-pas-couleurs', nom: 'Pas latéraux et couleurs', categorie: 'memoire', familles: ['cognitif', 'coordination'],
    position: 'debout', objectif: 'Réaction à un signal',
    description: 'Une couleur = une direction (rouge à droite, bleu à gauche). Faire le pas correspondant à la couleur annoncée.',
    securite: 'Appui à proximité.',
    facile: 'Deux couleurs', difficile: 'Trois couleurs (vert = sur place)', series: 2, duree: 45,
  },
  {
    id: 'ma-assis-debout-memorisation', nom: 'Assis-debout et mémorisation', categorie: 'memoire', familles: ['cognitif', 'renforcement'],
    position: 'debout', materiels: ['chaise'], objectif: 'Double tâche force + mémoire',
    description: 'À chaque lever de chaise, retenir un mot donné par l\'enseignant ; les restituer tous à la fin de la série.',
    securite: 'Chaise calée contre un mur.',
    facile: '3 mots', difficile: '6 mots, restitués dans l\'ordre', series: 2, repetitions: 5,
  },

  // ── PILATES ─────────────────────────────────────────────────────────────────
  {
    id: 'ma-respiration-latero-thoracique', nom: 'Respiration latéro-thoracique', categorie: 'endurance', familles: ['pilates', 'respiration', 'recuperation'],
    position: 'tous', objectif: 'Respiration du Pilates, mobilité des côtes',
    description: 'Mains posées sur les côtes. Inspirer par le nez en écartant les côtes sous les mains, expirer par la bouche en les laissant se rapprocher.',
    securite: 'Respiration calme, jamais forcée ; arrêter en cas de vertige.',
    respiration: RESPIRATION_PILATES, facile: '5 respirations', difficile: 'Expiration plus longue que l\'inspiration', series: 2, repetitions: 8,
  },
  {
    id: 'ma-engagement-centre', nom: 'Engagement doux du centre', categorie: 'force', familles: ['pilates', 'renforcement'],
    position: 'tous', objectif: 'Activer la sangle abdominale profonde',
    description: 'Sur l\'expiration, rentrer doucement le nombril vers la colonne (environ 30 % de l\'effort maximal), tenir quelques secondes en respirant, relâcher.',
    securite: 'Ne pas bloquer la respiration ; aucune poussée vers le bas.',
    respiration: RESPIRATION_PILATES, facile: 'Tenir 3 secondes', difficile: 'Tenir 10 secondes en respirant', series: 2, repetitions: 8,
  },
  {
    id: 'ma-knee-folds', nom: 'Knee folds (plier le genou vers soi)', categorie: 'force', familles: ['pilates', 'renforcement'],
    position: 'tous', materiels: ['tapis', 'chaise'], objectif: 'Stabilité du bassin, contrôle du centre',
    description: 'Allongé genoux fléchis (ou assis), centre engagé : soulever un pied pour amener le genou au-dessus de la hanche, sans que le bassin bouge, reposer, alterner.',
    securite: 'Bassin immobile ; petite amplitude au début.',
    respiration: RESPIRATION_PILATES, facile: 'Pied soulevé de quelques centimètres', difficile: 'Genou à 90°, retour très lent', series: 2, repetitions: 8,
  },
  {
    id: 'ma-heel-slides', nom: 'Heel slides (glissé de talon)', categorie: 'mobilite', familles: ['pilates', 'mobilite'],
    position: 'couche', materiels: ['tapis'], objectif: 'Mobilité de hanche avec bassin stable',
    description: 'Allongé, genoux fléchis. Faire glisser un talon au sol pour tendre la jambe, puis le ramener, bassin immobile. Alterner.',
    securite: 'Bas du dos posé, sans creuser.',
    respiration: RESPIRATION_PILATES, facile: 'Petite amplitude', difficile: 'Jambe tendue au-dessus du sol au retour', series: 2, repetitions: 8,
  },
  {
    id: 'ma-pont-pilates', nom: 'Pont Pilates (déroulé vertébral)', categorie: 'force', familles: ['pilates', 'renforcement'],
    position: 'couche', materiels: ['tapis'], objectif: 'Fessiers, mobilité de la colonne',
    description: 'Allongé, genoux fléchis. Décoller le bassin en déroulant la colonne vertèbre par vertèbre, puis redescendre de la même façon.',
    securite: 'Ne pas monter trop haut ; poids sur les épaules, jamais sur la nuque.',
    respiration: RESPIRATION_PILATES, facile: 'Bascule du bassin seulement', difficile: 'Tenir en haut 3 respirations', series: 2, repetitions: 8,
  },
  {
    id: 'ma-dead-bug', nom: 'Dead bug simplifié', categorie: 'force', familles: ['pilates', 'renforcement', 'coordination'],
    position: 'couche', materiels: ['tapis'], objectif: 'Contrôle du centre, coordination',
    description: 'Allongé, genoux fléchis pieds au sol, bras vers le plafond. Descendre un bras vers l\'arrière en gardant le dos posé, revenir ; puis bras et pied opposés.',
    securite: 'Bas du dos posé ; arrêter si le dos se creuse.',
    respiration: RESPIRATION_PILATES, facile: 'Bras seulement', difficile: 'Bras et jambe opposés, jambes à 90°', series: 2, repetitions: 8,
  },
  {
    id: 'ma-toe-taps', nom: 'Toe taps adaptés', categorie: 'force', familles: ['pilates', 'renforcement'],
    position: 'couche', materiels: ['tapis'], objectif: 'Renforcer le centre',
    description: 'Allongé, un genou au-dessus de la hanche (genou à 90°). Descendre la pointe du pied toucher le sol, remonter, centre engagé. Alterner.',
    securite: 'Bas du dos posé ; une seule jambe en l\'air au début.',
    respiration: RESPIRATION_PILATES, facile: 'Une jambe, petite amplitude', difficile: 'Deux jambes en l\'air, une qui descend', series: 2, repetitions: 8,
  },
  {
    id: 'ma-ouverture-genou', nom: 'Ouverture de genou (knee opening)', categorie: 'mobilite', familles: ['pilates', 'mobilite'],
    position: 'couche', materiels: ['tapis'], objectif: 'Mobilité de hanche, bassin stable',
    description: 'Allongé, genoux fléchis. Laisser un genou s\'ouvrir sur le côté sans que le bassin bascule, le ramener. Alterner.',
    securite: 'Prothèse de hanche : amplitude limitée selon les consignes médicales.',
    respiration: RESPIRATION_PILATES, facile: 'Petite ouverture', difficile: 'Ouverture lente sur 4 temps', series: 2, repetitions: 8,
  },
  {
    id: 'ma-rotation-genoux', nom: 'Rotation contrôlée des genoux', categorie: 'mobilite', familles: ['pilates', 'mobilite'],
    position: 'couche', materiels: ['tapis'], objectif: 'Mobilité de la colonne en rotation',
    description: 'Allongé, genoux fléchis et serrés. Laisser descendre les deux genoux d\'un côté, épaules au sol, puis revenir au centre et changer de côté.',
    securite: 'Petite amplitude ; aucune douleur lombaire.',
    respiration: RESPIRATION_PILATES, facile: 'Petite amplitude', difficile: 'Plus loin, retour en 4 temps', series: 2, repetitions: 8,
  },
  {
    id: 'ma-bird-dog', nom: 'Bird-dog simplifié', categorie: 'force', familles: ['pilates', 'renforcement', 'equilibre'],
    position: 'couche', materiels: ['tapis'], objectif: 'Stabilité du tronc et coordination',
    description: 'À quatre pattes, dos plat. Glisser une main vers l\'avant, revenir ; puis une jambe vers l\'arrière ; puis bras et jambe opposés.',
    securite: 'Coussin sous les genoux ; à éviter si la position à quatre pattes est difficile.',
    respiration: RESPIRATION_PILATES, facile: 'Bras seulement', difficile: 'Bras et jambe opposés tenus 3 secondes', series: 2, repetitions: 6,
  },
  {
    id: 'ma-swimming', nom: 'Swimming adapté', categorie: 'force', familles: ['pilates', 'renforcement', 'coordination'],
    position: 'tous', materiels: ['chaise', 'tapis'], objectif: 'Renforcer le dos, coordination',
    description: 'Assis droit (ou allongé sur le ventre), lever alternativement un bras devant en gardant l\'axe, comme un battement de nage lent.',
    securite: 'Sur le ventre : petite amplitude, cou dans l\'axe.',
    respiration: RESPIRATION_PILATES, facile: 'Assis, bras seulement', difficile: 'Au sol, bras et jambe opposés', series: 2, repetitions: 10,
  },
  {
    id: 'ma-rotation-thoracique-pilates', nom: 'Rotation thoracique Pilates', categorie: 'mobilite', familles: ['pilates', 'mobilite'],
    position: 'assis', materiels: ['chaise'], objectif: 'Rotation du haut du dos en gardant l\'axe',
    description: 'Assis, auto-grandi, bras croisés sur la poitrine. Expirer en tournant le buste d\'un côté, inspirer au centre, expirer de l\'autre côté. Le bassin ne bouge pas.',
    securite: 'Rotation depuis le haut du dos, sans forcer.',
    respiration: RESPIRATION_PILATES, facile: 'Petite rotation', difficile: 'Bras ouverts à l\'horizontale', series: 2, repetitions: 8,
  },
  {
    id: 'ma-inclinaison-pilates', nom: 'Inclinaison latérale Pilates (sirène)', categorie: 'souplesse', familles: ['pilates', 'souplesse', 'mobilite'],
    position: 'assis', materiels: ['chaise'], objectif: 'Allonger les flancs avec contrôle',
    description: 'Assis, auto-grandi. Lever un bras en arc au-dessus de la tête et s\'allonger sur le côté opposé, en gardant les deux fesses sur la chaise.',
    securite: 'S\'allonger vers le haut avant de s\'incliner ; pas de tassement.',
    respiration: RESPIRATION_PILATES, facile: 'Main glissée le long de la cuisse', difficile: 'Tenir 2 respirations', series: 2, repetitions: 6,
  },
  {
    id: 'ma-roll-down', nom: 'Roll-down partiel', categorie: 'mobilite', familles: ['pilates', 'mobilite'],
    position: 'debout', materiels: ['mur'], objectif: 'Mobilité de la colonne, contrôle',
    description: 'Dos contre le mur, genoux souples. Enrouler la tête puis le haut du dos vers l\'avant, vertèbre par vertèbre, jusqu\'à mi-dos, puis dérouler pour revenir.',
    securite: 'Amplitude partielle seulement ; déconseillé en cas d\'ostéoporose sévère (flexion du tronc).',
    respiration: RESPIRATION_PILATES, facile: 'Enroulement de la tête et des épaules seulement', difficile: 'Jusqu\'à mi-dos, retour très lent', series: 2, repetitions: 5,
  },
  {
    id: 'ma-elevation-laterale-jambe', nom: 'Élévation latérale de jambe (allongé sur le côté)', categorie: 'force', familles: ['pilates', 'renforcement'],
    position: 'couche', materiels: ['tapis'], objectif: 'Renforcer les abducteurs de hanche',
    description: 'Allongé sur le côté, jambe du dessous fléchie. Lever la jambe du dessus tendue à hauteur de hanche, redescendre lentement.',
    securite: 'Bassin aligné, ne pas rouler en arrière ; prothèse de hanche : avis médical.',
    respiration: RESPIRATION_PILATES, facile: 'Petite amplitude', difficile: 'Petits cercles en haut', series: 2, repetitions: 10,
  },
  {
    id: 'ma-demi-squat-pilates', nom: 'Demi-squat Pilates', categorie: 'force', familles: ['pilates', 'renforcement'],
    position: 'debout', materiels: ['chaise'], objectif: 'Renforcer les jambes avec placement',
    description: 'Debout, auto-grandi, centre engagé. Inspirer en fléchissant légèrement les genoux, expirer en remontant, sans perdre l\'axe.',
    securite: 'Appui à portée de main ; genoux dans l\'axe des pieds.',
    respiration: RESPIRATION_PILATES, facile: 'Mains sur le dossier', difficile: 'Bras tendus devant', series: 2, repetitions: 8,
  },
  {
    id: 'ma-equilibre-pilates', nom: 'Équilibre Pilates (allongement debout)', categorie: 'equilibre', familles: ['pilates', 'equilibre'],
    position: 'debout', materiels: ['chaise'], objectif: 'Équilibre par l\'axe et le centre',
    description: 'Debout, auto-grandi, centre engagé. Monter légèrement sur la pointe des pieds en s\'allongeant vers le haut, tenir, redescendre lentement.',
    securite: 'Appui à portée de main.',
    respiration: RESPIRATION_PILATES, facile: 'Mains sur l\'appui, talons au sol', difficile: 'Sur un pied, sans appui', series: 2, duree: 20,
  },
];

export const EXERCICES_MOUVAPA: Exercice[] = DEFINITIONS.map(construire);

// ── Exercices de la demande qui existaient déjà : réutilisés, jamais recréés ────
// Nom demandé → identifiant existant dans EXERCICES_HISTORIQUES.
export const CORRESPONDANCES_EXISTANTS: Record<string, string> = {
  'Extension de genou assis': 'ot-genou-ext',
  'Flexion de genou debout': 'ot-genou-flex',
  'Abduction de hanche debout': 'ot-hanche-abd',
  'Extension de hanche debout': 'ot-hanche-ext',
  'Flexion de hanche debout': 'mob_flexion_hanche_debout',
  'Élévation des talons debout': 'ot-mollets',
  'Assis-debout': 'force-lever-chaise',
  'Demi-squat avec chaise': 'force-demi-squat',
  'Chaise contre un mur': 'sep_ex_01',
  'Montée sur marche': 'force-montee-marche',
  'Pont fessier': 'force-pont-fessier',
  'Cercles de chevilles': 'mob-cercles-chevilles',
  'Flexion dorsale de cheville': 'mob_chevilles_assis',
  'Serrage balle souple': 'force-serrage-balle',
  'Développé épaules': 'fr_force_03',
  'Tirage horizontal avec élastique': 'fr_force_01',
  'Élévations frontales': 'force-elevation-bras',
  'Cercles d\'épaules': 'fr_ech_01',
  'Rotation externe épaules': 'ma-rotation-externe-elastique',
  'Mobilité coudes': 'fr_01',
  'Mobilité poignets': 'fr_ech_02',
  'Rotation thoracique assise': 'fr_02',
  'Rotation thoracique debout': 'mob-rotation-tronc',
  'Flexion/extension genou': 'mob-flexion-genou',
  'Étirement mollets': 'soup-etirement-mollet',
  'Étirement quadriceps adapté': 'soup-quadriceps',
  'Étirement ischio-jambiers assis': 'fr_souplesse_01',
  'Marche sur place': 'end-marche-place',
  'Montées de genoux debout': 'end_montee_genoux_place',
  'Step': 'end-stepping',
  'Marche fractionnée': 'end_marche_fractionnee',
  'Transfert droite/gauche': 'ot-transfert-lateral',
  'Tandem': 'ot-tandem-statique',
  'Appui unipodal sécurisé': 'eq-unipodal',
  'Marche sur place avec appui': 'avc_03',
  'Marche arrière sécurisée': 'ot-marche-arriere',
  'Respiration diaphragmatique': 'all_01',
  'Marche + compter': 'mem-double-tache',
};

// Familles, matériel et position RÉELLE des exercices historiques utilisés par la bibliothèque.
// Les familles et le matériel sont de nouveaux champs (sans effet sur l'IA, l'espace patient ou les
// PDF). La position n'écrase JAMAIS `positionRequise` : elle ne sert qu'aux filtres et aux règles des
// modèles (ex. `ot-lever-chaise` est noté « assis » mais fait se lever : il ne doit pas entrer dans
// un modèle « 100 % assis »).
export const ENRICHISSEMENT_EXISTANTS: Record<string, { familles: FamilleExercice[]; materiels?: MaterielExercice[]; position: Position }> = {
  'eq-unipodal': { familles: ['equilibre'], materiels: ['chaise'], position: 'debout' },
  'eq-tandem': { familles: ['equilibre'], position: 'debout' },
  'eq-transfert': { familles: ['equilibre'], materiels: ['chaise'], position: 'debout' },
  'eq-marche-talon': { familles: ['equilibre'], position: 'debout' },
  'force-lever-chaise': { familles: ['renforcement'], materiels: ['chaise'], position: 'debout' },
  'force-demi-squat': { familles: ['renforcement'], materiels: ['chaise'], position: 'debout' },
  'force-pont-fessier': { familles: ['renforcement'], materiels: ['tapis'], position: 'couche' },
  'force-montee-marche': { familles: ['renforcement', 'cardio'], materiels: ['step'], position: 'debout' },
  'force-rotation-epaule': { familles: ['mobilite', 'renforcement'], position: 'tous' },
  'force-elevation-bras': { familles: ['renforcement'], materiels: ['petits_poids'], position: 'tous' },
  'force-serrage-balle': { familles: ['renforcement'], materiels: ['ballon'], position: 'tous' },
  'mob-rotation-tronc': { familles: ['mobilite'], materiels: ['chaise'], position: 'assis' },
  'mob-cercles-chevilles': { familles: ['mobilite'], materiels: ['chaise'], position: 'assis' },
  'mob-flexion-genou': { familles: ['mobilite'], materiels: ['chaise'], position: 'assis' },
  'soup-etirement-mollet': { familles: ['souplesse', 'recuperation'], materiels: ['mur'], position: 'debout' },
  'soup-quadriceps': { familles: ['souplesse'], materiels: ['chaise'], position: 'debout' },
  'soup-dos-chat': { familles: ['souplesse', 'mobilite'], materiels: ['tapis'], position: 'couche' },
  'end-marche-place': { familles: ['cardio'], position: 'debout' },
  'end-stepping': { familles: ['cardio'], materiels: ['step'], position: 'debout' },
  'mem-double-tache': { familles: ['cognitif', 'cardio'], position: 'debout' },
  'mem-jeu-paires': { familles: ['cognitif'], position: 'tous' },
  'fr_01': { familles: ['mobilite', 'renforcement'], position: 'assis' },
  'fr_02': { familles: ['mobilite'], position: 'assis' },
  'fr_ech_01': { familles: ['mobilite'], position: 'assis' },
  'fr_ech_02': { familles: ['mobilite'], position: 'assis' },
  'fr_ech_03': { familles: ['mobilite'], position: 'assis' },
  'fr_force_01': { familles: ['renforcement'], materiels: ['elastique'], position: 'assis' },
  'fr_force_03': { familles: ['renforcement'], materiels: ['petits_poids'], position: 'assis' },
  'fr_tronc_01': { familles: ['renforcement'], position: 'assis' },
  'fr_souplesse_01': { familles: ['souplesse'], position: 'assis' },
  'all_01': { familles: ['respiration', 'recuperation', 'pilates'], position: 'tous' },
  'all_02': { familles: ['coordination', 'cognitif'], position: 'assis' },
  'all_03': { familles: ['renforcement'], position: 'assis' },
  'univ_03': { familles: ['renforcement'], position: 'assis' },
  'mob_chevilles_assis': { familles: ['mobilite'], position: 'assis' },
  'mob_flexion_hanche_debout': { familles: ['mobilite'], materiels: ['chaise'], position: 'debout' },
  'mob_extension_hanche_debout': { familles: ['mobilite'], materiels: ['chaise'], position: 'debout' },
  'ot-genou-ext': { familles: ['renforcement'], materiels: ['chaise'], position: 'assis' },
  'ot-genou-flex': { familles: ['renforcement'], materiels: ['chaise'], position: 'debout' },
  'ot-hanche-abd': { familles: ['renforcement'], materiels: ['chaise'], position: 'debout' },
  'ot-hanche-ext': { familles: ['renforcement'], materiels: ['chaise'], position: 'debout' },
  'ot-mollets': { familles: ['renforcement'], materiels: ['chaise'], position: 'debout' },
  'ot-transfert-lateral': { familles: ['equilibre'], materiels: ['chaise'], position: 'debout' },
  'ot-tandem-statique': { familles: ['equilibre'], materiels: ['chaise'], position: 'debout' },
  'ot-marche-tandem': { familles: ['equilibre'], position: 'debout' },
  'ot-marche-arriere': { familles: ['equilibre'], position: 'debout' },
  'ot-lever-chaise': { familles: ['renforcement', 'equilibre'], materiels: ['chaise'], position: 'debout' },
  'avc_03': { familles: ['equilibre', 'cardio'], materiels: ['chaise'], position: 'debout' },
  'sep_ex_01': { familles: ['renforcement'], materiels: ['mur'], position: 'debout' },
  'end_marche_fractionnee': { familles: ['cardio'], position: 'debout' },
  'end_montee_genoux_place': { familles: ['cardio'], position: 'debout' },
};

/** Applique familles et matériel aux exercices historiques (positionRequise jamais modifiée). */
export function enrichirExistant(ex: Exercice): Exercice {
  const e = ENRICHISSEMENT_EXISTANTS[ex.id];
  if (!e) return ex;
  return { ...ex, familles: ex.familles ?? e.familles, materiels: ex.materiels ?? e.materiels };
}

export const FAMILLES_PAR_CATEGORIE: Record<CategorieExercice, FamilleExercice[]> = {
  equilibre: ['equilibre'], force: ['renforcement'], mobilite: ['mobilite'],
  souplesse: ['souplesse'], endurance: ['cardio'], memoire: ['coordination', 'cognitif'],
};

/** Familles d'un exercice ; à défaut (exercice historique non enrichi, exercice personnel), celles de sa catégorie. */
export function famillesDe(ex: Exercice): FamilleExercice[] {
  return ex.familles && ex.familles.length > 0 ? ex.familles : FAMILLES_PAR_CATEGORIE[ex.categorie] ?? [];
}

/** Position réelle (assis / debout / couche / tous) servant aux filtres et aux modèles, ou null si inconnue. */
export function positionDe(ex: Exercice): Position | null {
  const surcharge = ENRICHISSEMENT_EXISTANTS[ex.id]?.position;
  if (surcharge) return surcharge;
  const p = ex.positionRequise;
  if (p === 'fauteuil') return 'assis';
  return p ?? null;
}
