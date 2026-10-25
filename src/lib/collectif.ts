import type { Exercice, FamilleExercice, MaterielExercice, ProgrammeModele, TypeProgramme, JourProgramme } from '../types';

// Bibliothèque collective (« Collectif ») : logique pure, sans Supabase ni React (testée dans
// collectif.test.ts).
//
// Ce qui part dans Collectif est une LISTE BLANCHE de champs professionnels, jamais l'objet entier :
// un champ ajouté demain à Exercice ou ProgrammeModele (et qui contiendrait une donnée personnelle)
// ne serait pas publié par accident. Sont volontairement exclus : photo (fichier personnel), profils
// et adaptations par pathologie (le partage reste générique), message de motivation d'un modèle
// (souvent nominatif), et bien sûr toute donnée de bénéficiaire.

// ── Contenu d'un exercice partagé ────────────────────────────────────────────

export interface ContenuExerciceCollectif {
  nom: string;
  categorie: Exercice['categorie'];
  description: string;
  consigneSecurite?: string;
  niveaux: Exercice['niveaux'];
  materielNecessaire?: string;
  dureeEstimeeMinutes: number;
  positionRequise?: Exercice['positionRequise'];
  niveauConfig?: Exercice['niveau_config'];
  videoYoutubeId?: string;
  familles?: FamilleExercice[];
  materiels?: MaterielExercice[];
  objectif?: string;
  respiration?: string;
  varianteFacile?: string;
  varianteDifficile?: string;
}

export function contenuExercicePartage(ex: Exercice): ContenuExerciceCollectif {
  return {
    nom: ex.nom.trim(),
    categorie: ex.categorie,
    description: ex.description,
    consigneSecurite: ex.consigneSecurite,
    niveaux: ex.niveaux,
    materielNecessaire: ex.materielNecessaire,
    dureeEstimeeMinutes: ex.dureeEstimeeMinutes,
    positionRequise: ex.positionRequise,
    niveauConfig: ex.niveau_config,
    videoYoutubeId: ex.videoYoutubeId,
    familles: ex.familles,
    materiels: ex.materiels,
    objectif: ex.objectif,
    respiration: ex.respiration,
    varianteFacile: ex.varianteFacile,
    varianteDifficile: ex.varianteDifficile,
  };
}

/**
 * Copie personnelle d'un exercice collectif. La table exercices_personnalises n'a pas de colonnes
 * pour l'objectif, la respiration ni les variantes : on les ajoute à la description pour ne rien
 * perdre, plutôt que de migrer la table.
 */
export function exercicePersonnelDepuisCollectif(c: ContenuExerciceCollectif): Omit<Exercice, 'id'> {
  const complements = [
    c.objectif ? `Objectif : ${c.objectif}` : '',
    c.respiration ? `Respiration : ${c.respiration}` : '',
    c.varianteFacile ? `Plus facile : ${c.varianteFacile}` : '',
    c.varianteDifficile ? `Plus difficile : ${c.varianteDifficile}` : '',
  ].filter(Boolean);
  return {
    nom: c.nom,
    categorie: c.categorie,
    description: [c.description, ...complements].join('\n'),
    consigneSecurite: c.consigneSecurite,
    niveaux: c.niveaux,
    materielNecessaire: c.materielNecessaire,
    dureeEstimeeMinutes: c.dureeEstimeeMinutes,
    positionRequise: c.positionRequise,
    niveau_config: c.niveauConfig,
    videoYoutubeId: c.videoYoutubeId,
  };
}

/** Exercice affichable (carte, aperçu) à partir d'un contenu collectif. */
export function exerciceAffichableDepuisCollectif(id: string, c: ContenuExerciceCollectif): Exercice {
  return {
    id,
    nom: c.nom,
    categorie: c.categorie,
    description: c.description,
    consigneSecurite: c.consigneSecurite,
    niveaux: c.niveaux,
    materielNecessaire: c.materielNecessaire,
    dureeEstimeeMinutes: c.dureeEstimeeMinutes,
    positionRequise: c.positionRequise,
    niveau_config: c.niveauConfig,
    videoYoutubeId: c.videoYoutubeId,
    familles: c.familles,
    materiels: c.materiels,
    objectif: c.objectif,
    respiration: c.respiration,
    varianteFacile: c.varianteFacile,
    varianteDifficile: c.varianteDifficile,
  };
}

// ── Contenu d'un modèle partagé ──────────────────────────────────────────────

export interface ExerciceDeModeleCollectif {
  nom: string;
  categorie?: string;
  description?: string;
  conseilSecurite?: string;
  series?: number;
  repetitions?: number;
  dureeSecondes?: number;
}

export interface ContenuModeleCollectif {
  nom: string;
  objectif?: string;
  type: TypeProgramme;
  seances: { nom: string; description?: string; exercices: ExerciceDeModeleCollectif[] }[];
  /** Jours de pratique → index de la séance dans `seances`. */
  planning: Partial<Record<JourProgramme, number>>;
}

export function contenuModelePartage(m: ProgrammeModele): ContenuModeleCollectif {
  const seances = [...m.seances].sort((a, b) => a.ordre - b.ordre);
  const indexParSeance = new Map(seances.map((s, i) => [s.id, i]));
  const planning: Partial<Record<JourProgramme, number>> = {};
  for (const p of m.planning) {
    const i = indexParSeance.get(p.seanceId);
    if (i != null) planning[p.jour] = i;
  }
  return {
    nom: m.nom.trim(),
    objectif: m.objectif,
    type: m.type,
    seances: seances.map(s => ({
      nom: s.nom,
      description: s.description,
      exercices: [...s.exercices].sort((a, b) => a.ordre - b.ordre).map(e => ({
        nom: e.nom,
        categorie: e.categorie,
        description: e.description,
        conseilSecurite: e.conseilSecurite,
        series: e.series,
        repetitions: e.repetitions,
        dureeSecondes: e.dureeSecondes,
      })),
    })),
    planning,
  };
}

export interface DonneesModelePersonnel {
  nom: string;
  objectif?: string;
  type: TypeProgramme;
  seances: { tempId: string; nom: string; description?: string; exercices: ExerciceDeModeleCollectif[] }[];
  planning: Partial<Record<JourProgramme, string | null>>;
}

/** Copie indépendante d'un modèle collectif, au format de createModele (useProgrammesModeles). */
export function modelePersonnelDepuisCollectif(c: ContenuModeleCollectif): DonneesModelePersonnel {
  const seances = c.seances.map((s, i) => ({ tempId: `collectif-${i}`, nom: s.nom, description: s.description, exercices: s.exercices.map(e => ({ ...e })) }));
  const planning: Partial<Record<JourProgramme, string | null>> = {};
  for (const [jour, i] of Object.entries(c.planning) as [JourProgramme, number][]) {
    if (seances[i]) planning[jour] = seances[i].tempId;
  }
  return { nom: c.nom, objectif: c.objectif, type: c.type, seances, planning };
}

export function nombreExercices(c: ContenuModeleCollectif): number {
  return c.seances.reduce((n, s) => n + s.exercices.length, 0);
}

// ── Garde-fou : noms de bénéficiaires ────────────────────────────────────────

const normaliser = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function contientMot(texteNormalise: string, mot: string): boolean {
  const m = normaliser(mot.trim());
  if (m.length < 3) return false;
  const echappe = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${echappe}($|[^a-z0-9])`).test(texteNormalise);
}

export interface AlerteBeneficiaire {
  /** Prénom ET nom trouvés côte à côte : publication bloquée. */
  bloquant: string[];
  /** Prénom OU nom trouvé seul : à vérifier (peut être un mot courant, ex. un nom « Pont »). */
  aVerifier: string[];
}

/** Texte complet d'un contenu tel qu'il serait publié (tous les champs, valeurs seulement). */
export function textePublie(contenu: object): string {
  const morceaux: string[] = [];
  const parcourir = (v: unknown) => {
    if (typeof v === 'string') morceaux.push(v);
    else if (Array.isArray(v)) v.forEach(parcourir);
    else if (v && typeof v === 'object') Object.values(v).forEach(parcourir);
  };
  parcourir(contenu);
  return morceaux.join(' \n ');
}

export function detecterBeneficiaires(texte: string, beneficiaires: { prenom?: string; nom?: string }[]): AlerteBeneficiaire {
  const t = normaliser(texte);
  const bloquant = new Set<string>();
  const aVerifier = new Set<string>();
  for (const b of beneficiaires) {
    const prenom = (b.prenom ?? '').trim();
    const nom = (b.nom ?? '').trim();
    if (prenom && nom && (contientMot(t, `${prenom} ${nom}`) || contientMot(t, `${nom} ${prenom}`))) {
      bloquant.add(`${prenom} ${nom}`);
      continue;
    }
    if (prenom && contientMot(t, prenom)) aVerifier.add(prenom);
    if (nom && contientMot(t, nom)) aVerifier.add(nom);
  }
  return { bloquant: [...bloquant], aVerifier: [...aVerifier] };
}
