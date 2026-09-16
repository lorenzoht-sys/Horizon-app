// Normalisation d'un programme (V1 ou V2) vers une forme unique consommée
// par le composant PDF (ProgrammePDF.tsx) — même esprit que
// normaliserVisibilite (mappers.ts) pour la migration messagePraticien :
// une seule fonction de lecture, jamais deux composants de rendu à
// maintenir en parallèle.
//
// ── Pourquoi un programme V1 devient « une séance implicite » ────────────
// `Programme` (V1) porte ses exercices à plat (`programme.exercices`), sans
// notion de séances nommées. `ProgrammeV2` porte plusieurs `seances`,
// chacune avec ses propres exercices. Pour que le composant PDF n'ait
// qu'une seule forme à lire, un programme V1 se normalise en un programme
// à UNE séance, qui porte tous ses exercices — le titre du programme sert
// aussi de nom à cette séance unique.
//
// ── Pourquoi les jours actifs sont résolus ici, pas dans le rendu ────────
// En V1, chaque EXERCICE porte ses propres jours (`frequenceParSemaine`).
// En V2, c'est la SÉANCE qui est planifiée (`ProgrammePlanningV2`), tous ses
// exercices partagent donc les mêmes jours. Plutôt que le composant PDF
// gère deux logiques différentes, la normalisation résout un
// `joursActifs: number[]` (1=lundi … 7=dimanche) par exercice dans les deux
// cas — hérité de la séance en V2, propre à l'exercice en V1.

import type {
  Exercice, ExerciceProgramme, Programme, ProgrammeExerciceV2, ProgrammeV2,
  CategorieExercice, NiveauExercice, ProfilHandicap, JourProgramme,
} from '../types';

export interface ExercicePourPDF {
  id: string;
  ordre: number;
  nom: string;
  categorie?: CategorieExercice;
  description?: string;
  consigneSecurite?: string;
  series?: number;
  repetitions?: number;
  dureeSecondes?: number;
  /** Déjà résolu en texte affichable ("Débutant : ..." / "Niveau 2 : ..."),
   *  le composant PDF n'a pas à connaître les deux échelles de niveau. */
  niveauLabel?: string;
  /** V1 uniquement — V2 n'a pas de note libre par exercice programmé. */
  notePersonnalisee?: string;
  adaptationTexte?: string;
  videoYoutubeId?: string;
  /** 1=lundi … 7=dimanche. Vide si le programme/la séance n'a pas de
   *  planning (V2 sans jour assigné). */
  joursActifs: number[];
}

export interface SeancePourPDF {
  id: string;
  nom: string;
  exercices: ExercicePourPDF[];
}

export interface ProgrammePourPDF {
  titre: string;
  objectif?: string;
  messageMotivation?: string;
  /** V1 uniquement — V2 n'a pas de date de début distincte de sa création. */
  dateDebut?: string;
  /** Date affichée en pied de page. */
  dateReference: string;
  seances: SeancePourPDF[];
}

const NIVEAU_LABEL_V1: Record<NiveauExercice, string> = {
  debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé',
};

const JOUR_NUM: Record<JourProgramme, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7,
};

function resoudreExerciceV1(
  ep: ExerciceProgramme,
  catalogue: Exercice[],
  profilHandicap?: ProfilHandicap | null,
): ExercicePourPDF | null {
  // Même filtre que l'ancien composant : un exercice supprimé du catalogue
  // depuis n'apparaît pas plutôt que de planter le rendu.
  const ex = catalogue.find(e => e.id === ep.exerciceId);
  if (!ex) return null;

  const niveauTexte = ex.niveaux[ep.niveau];
  return {
    id: ep.exerciceId,
    ordre: ep.ordre,
    nom: ex.nom,
    categorie: ex.categorie,
    description: ex.description,
    consigneSecurite: ex.consigneSecurite,
    series: ep.series,
    repetitions: ep.repetitions,
    dureeSecondes: ep.dureeSecondes,
    niveauLabel: niveauTexte ? `${NIVEAU_LABEL_V1[ep.niveau]} : ${niveauTexte}` : NIVEAU_LABEL_V1[ep.niveau],
    notePersonnalisee: ep.notePersonnalisee,
    adaptationTexte: profilHandicap ? ex.adaptations?.[profilHandicap] : undefined,
    videoYoutubeId: ex.videoYoutubeId,
    joursActifs: [...ep.frequenceParSemaine].sort((a, b) => a - b),
  };
}

/** Programme V1 → programme normalisé à une seule séance implicite. */
export function normaliserProgrammeV1(
  programme: Programme,
  catalogue: Exercice[],
  profilHandicap?: ProfilHandicap | null,
): ProgrammePourPDF {
  const exercices = [...programme.exercices]
    .sort((a, b) => a.ordre - b.ordre)
    .map(ep => resoudreExerciceV1(ep, catalogue, profilHandicap))
    .filter((e): e is ExercicePourPDF => e !== null);

  return {
    titre: programme.titre,
    objectif: programme.objectif || undefined,
    messageMotivation: programme.messageMotivation || undefined,
    dateDebut: programme.dateDebut,
    dateReference: programme.dateCreation,
    seances: [{ id: programme.id, nom: programme.titre, exercices }],
  };
}

function resoudreExerciceV2(
  ep: ProgrammeExerciceV2,
  joursActifs: number[],
  catalogue: Exercice[],
  profilHandicap?: ProfilHandicap | null,
): ExercicePourPDF {
  // `exerciceId` est optionnel en V2 : un exercice de séance peut être saisi
  // libre, sans lien vers le catalogue. Quand le lien existe, on l'utilise
  // pour la vidéo et le texte de niveau détaillé — jamais pour nom/
  // description/consigne, déjà portés directement par l'exercice de séance.
  const ex = ep.exerciceId ? catalogue.find(e => e.id === ep.exerciceId) : undefined;
  const niveauTexte = ep.niveau ? ex?.niveau_config?.[ep.niveau]?.description : undefined;

  return {
    id: ep.id,
    ordre: ep.ordre,
    nom: ep.nom,
    categorie: (ex?.categorie ?? (ep.categorie as CategorieExercice | undefined)),
    description: ep.description ?? ex?.description,
    consigneSecurite: ep.conseilSecurite ?? ex?.consigneSecurite,
    series: ep.series,
    repetitions: ep.repetitions,
    dureeSecondes: ep.dureeSecondes,
    niveauLabel: ep.niveau ? (niveauTexte ? `Niveau ${ep.niveau} : ${niveauTexte}` : `Niveau ${ep.niveau}`) : undefined,
    adaptationTexte: profilHandicap ? ex?.adaptations?.[profilHandicap] : undefined,
    videoYoutubeId: ex?.videoYoutubeId,
    joursActifs,
  };
}

/**
 * Programme V2 → programme normalisé. `seanceIds` restreint l'export à ces
 * séances (undefined = toutes) — c'est le seul point d'entrée pour
 * n'exporter qu'une séance au lieu du programme entier.
 */
export function normaliserProgrammeV2(
  programme: ProgrammeV2,
  catalogue: Exercice[],
  profilHandicap?: ProfilHandicap | null,
  seanceIds?: string[],
): ProgrammePourPDF {
  const seancesRetenues = seanceIds
    ? programme.seances.filter(s => seanceIds.includes(s.id))
    : programme.seances;

  const seances: SeancePourPDF[] = [...seancesRetenues]
    .sort((a, b) => a.ordre - b.ordre)
    .map(s => {
      const joursActifs = programme.planning
        .filter(p => p.seanceId === s.id)
        .map(p => JOUR_NUM[p.jour])
        .sort((a, b) => a - b);
      const exercices = [...s.exercices]
        .sort((a, b) => a.ordre - b.ordre)
        .map(ep => resoudreExerciceV2(ep, joursActifs, catalogue, profilHandicap));
      return { id: s.id, nom: s.nom, exercices };
    });

  return {
    titre: programme.nom,
    objectif: programme.objectif,
    messageMotivation: programme.messageMotivation,
    dateReference: programme.createdAt,
    seances,
  };
}
