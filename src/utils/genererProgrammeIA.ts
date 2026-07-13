// Génération IA d'un programme d'exercices structuré — module partagé entre
// ProgrammePage.tsx ("Générer avec l'IA", mécanisme déjà existant) et
// AssistantPage.tsx (action "programme" dans "Mon assistant", qui produisait
// jusqu'ici un texte markdown libre non exploitable — voir diagnostic).
//
// Un seul mécanisme : le prompt, l'appel IA, la validation du JSON et la
// résolution du catalogue vivent ICI. ProgrammePage.tsx et AssistantPage.tsx
// appellent les mêmes fonctions et affichent le même écran de relecture —
// PreviewIAModal (ProgrammePage.tsx), déjà existant, réutilisé tel quel.
//
// La sortie (type ProgrammeIA) était déjà en JSON strict côté ProgrammePage
// (construirePromptIA, déplacé ici) ; ce qui manquait et qu'on ajoute :
// injection du catalogue réel (exerciceId) et résolution niveau_config →
// series/repetitions/duree_secondes, cohérente avec ExerciceForm.

import type { Participant, Bilan, ProgrammeV2, Exercice, TypeProgramme, JourProgramme } from '../types';
import { JOURS_PROGRAMME } from '../types';
import { getAuthHeader } from '../lib/supabase';
import { getContreIndications, getTestsAutonomie } from '../lib/anamnese';

// ─── Types (déplacés depuis ProgrammePage.tsx — importés par les deux appelants) ──

export interface ConfigGenerationIA {
  objectif: string;
  frequence: number;
  duree: number;
  niveau: 1 | 2 | 3;
}

export interface ExerciceIA {
  nom: string;
  categorie: string;
  description: string;
  conseil_securite?: string;
  niveau: number;
  series?: number | null;
  repetitions?: number | null;
  duree_secondes?: number | null;
  /** Référence au catalogue (EXERCICES_BASE + exercices custom) — absent si
   *  exercice libre (hors catalogue, ou exerciceId halluciné par l'IA et
   *  retombé en repli). */
  exerciceId?: string;
}

export interface SeanceIA {
  nom: string;
  description?: string;
  exercices: ExerciceIA[];
}

export interface ProgrammeIA {
  nom: string;
  description?: string;
  objectif: string;
  message_motivation: string;
  niveau_global: number;
  seances: SeanceIA[];
  planning: Record<string, string>;
  conseils_generaux?: string;
}

// ─── Contexte patient ─────────────────────────────────────────────────────────

function calcAge(dateNaissance: string): number {
  if (!dateNaissance) return 0;
  return Math.floor((Date.now() - new Date(dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000));
}

function buildContextePatient(patient: Participant, dernierBilan: Bilan | null): string {
  const age = calcAge(patient.dateNaissance);
  const traitements = (patient.traitements ?? []).map(t => t.nom).filter(Boolean).join(', ');
  const antecedents = [patient.antecedentsMedicaux, patient.antecedentsChirurgicaux].filter(Boolean).join(' · ');
  const bilanInitial = patient.bilans.find(b => b.type === 'initial') ?? null;
  const ciInfo = getContreIndications(patient, bilanInitial);
  const ci = ciInfo.actif ? (ciInfo.detail ?? 'non précisées') : 'aucune contre-indication renseignée';
  const { sedentarite, fatigue } = getTestsAutonomie(patient, bilanInitial);

  return `PATIENT : ${patient.prenom} ${patient.nom}, ${age} ans
PATHOLOGIE : ${patient.pathologie || 'non renseignée'}
ANTÉCÉDENTS : ${antecedents || 'non renseignés'}
TRAITEMENTS : ${traitements || 'non renseignés'}
ALLERGIES : ${patient.allergies || 'aucune connue'}
PROFIL DE HANDICAP : ${patient.profilHandicap || 'aucun profil de handicap renseigné'}
MODE DE DÉPLACEMENT : ${patient.modeDeplacementHabituel ?? 'non renseigné'}${patient.modeDeplacementDetail ? ` (${patient.modeDeplacementDetail})` : ''}
CONTRE-INDICATIONS À L'EFFORT : ${ci}
NIVEAU D'ACTIVITÉ PHYSIQUE : ${sedentarite.profil ?? 'non renseigné'}
FATIGUE PERÇUE : ${fatigue.profil ?? 'non renseignée'}
${dernierBilan ? `DERNIERS SCORES (bilan du ${dernierBilan.date}) :
- TUG (Timed Up and Go) : ${dernierBilan.tug3m ?? 'NR'} s
- Chair Stand 30s : ${dernierBilan.chairStand30 ?? 'NR'} répétitions
- Force de préhension (HandGrip droite) : ${dernierBilan.handGrip?.droite ?? 'NR'} kg
- Équilibre (appui droit) : ${dernierBilan.equilibre?.droite ?? 'NR'} s
- Ressenti à l'effort (Borg) : ${dernierBilan.tm6?.borgRPE ?? 'NR'}/20` : "Aucun bilan disponible — adapter le programme au profil et à la pathologie déclarés."}`;
}

function formatCatalogue(catalogue: Exercice[]): string {
  return JSON.stringify(catalogue.map(ex => ({
    id: ex.id,
    nom: ex.nom,
    categorie: ex.categorie,
    description: ex.description,
    positionRequise: ex.positionRequise ?? null,
    niveauMobilite: ex.niveauMobilite ?? null,
    profilsCompatibles: ex.profilsCompatibles ?? null,
    adaptations: ex.adaptations ?? null,
  })));
}

// ─── Étape 1 — Questions de clarification ────────────────────────────────────

/** 2-4 questions ciblées sur des capacités précises absentes du profil
 *  enregistré (jamais une question dont la réponse est déjà connue). Appelée
 *  par les deux points d'entrée avant la génération du programme. Un échec
 *  ici n'empêche pas de continuer : l'appelant peut générer sans réponses. */
export async function genererQuestionsClarification(patient: Participant): Promise<string[]> {
  const contexte = buildContextePatient(patient, patient.bilans[0] ?? null);
  const prompt = `Tu es un expert en Activité Physique Adaptée (APA). Avant de construire un programme d'exercices pour ce patient, identifie 2 à 4 questions CIBLÉES à poser au praticien — uniquement sur des capacités précises qui ne sont PAS déjà couvertes par le profil ci-dessous (ne redemande jamais une information déjà présente : pathologie, contre-indications, mode de déplacement, etc.).

${contexte}

Réponds UNIQUEMENT en JSON valide (aucun backtick, aucun commentaire) avec cette structure exacte :
{ "questions": ["question 1", "question 2", ...] }`;

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Erreur API Claude (${response.status}): ${err}`);
  }

  const data = await response.json();
  let parsed: { questions?: unknown };
  try {
    parsed = JSON.parse(data.text ?? '{}');
  } catch {
    throw new Error('Réponse IA invalide (JSON incorrect) — réessayez.');
  }
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];
  if (questions.length === 0) {
    throw new Error('Aucune question générée.');
  }
  return questions;
}

// ─── Étape 2 — Génération structurée ──────────────────────────────────────────

function construirePrompt(
  patient: Participant,
  config: ConfigGenerationIA,
  reponsesClarification: string,
  catalogue: Exercice[],
  dernierBilan: Bilan | null,
  programmesExistants: ProgrammeV2[],
): string {
  const contexte = buildContextePatient(patient, dernierBilan);
  const niveauLabel = config.niveau === 1 ? 'Facile (débutant, fragile)'
    : config.niveau === 2 ? 'Modéré (actif, effort soutenu)'
    : 'Intense (entraîné, bon niveau fonctionnel)';
  const nbExercices = config.frequence === 2 ? '1 à 2' : config.frequence <= 3 ? '2 à 3' : '3 à 4';

  return `Tu es un expert en Activité Physique Adaptée (APA) certifié.
Génère un programme d'exercices personnalisé pour ce patient.

${contexte}
PROGRAMMES EXISTANTS : ${programmesExistants.map(p => p.nom).join(', ') || 'aucun'}

CONFIGURATION DEMANDÉE :
- Objectif : ${config.objectif}
- Fréquence : ${config.frequence} séances par semaine
- Durée par séance : ${config.duree} minutes
- Niveau : ${niveauLabel}

RÉPONSES DU PRATICIEN AUX QUESTIONS DE CLARIFICATION :
${reponsesClarification || '(aucune réponse fournie)'}

CATALOGUE D'EXERCICES DISPONIBLES (utilise en PRIORITÉ un "id" de ce catalogue via le champ "exerciceId" — ne propose un exercice hors catalogue que si aucun exercice du catalogue ne convient) :
${formatCatalogue(catalogue)}

RÈGLES ABSOLUES :
1. Respecter toutes les contre-indications, pathologies et allergies signalées, sans exception.
2. En cas de traitement anticoagulant ou de risque de chute → éviter tout exercice à risque de choc ou de chute.
3. Adapter le niveau de difficulté aux scores fonctionnels du dernier bilan, s'ils sont disponibles.
4. Ne pas reproduire à l'identique les programmes existants listés ci-dessus.
5. Priorise les exercices du catalogue dont "profilsCompatibles"/"adaptations" correspondent au profil du patient (profil de handicap, mobilité).
6. Pour un exercice du catalogue, indique un "niveau" ("1"|"2"|"3") adapté — n'invente pas series/repetitions/duree_secondes toi-même pour ces exercices-là, ils seront recalculés automatiquement à partir du niveau choisi.
7. Pour un exercice hors catalogue (uniquement si nécessaire), fournis toi-même series/repetitions/duree_secondes cohérents.

Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après, sans balises markdown, sans commentaires.

Format JSON exact attendu :
{
  "nom": "string (nom court et descriptif, ex: Programme Équilibre ${patient.prenom})",
  "description": "string (1-2 phrases décrivant le programme)",
  "objectif": "string (objectif principal en 1 phrase)",
  "message_motivation": "string (message positif et encourageant pour le patient, 1 phrase)",
  "niveau_global": ${config.niveau},
  "seances": [
    {
      "nom": "string (ex: Séance A, Séance Équilibre)",
      "description": "string (description courte de la séance)",
      "exercices": [
        { "exerciceId": "id_du_catalogue", "niveau": ${config.niveau} },
        { "nom": "Exercice hors catalogue si nécessaire", "categorie": "equilibre", "description": "...", "conseil_securite": "...", "niveau": ${config.niveau}, "series": nombre_ou_null, "repetitions": nombre_ou_null, "duree_secondes": nombre_ou_null }
      ]
    }
  ],
  "planning": {
    "lundi": "string (nom de séance exact ou repos)",
    "mardi": "string", "mercredi": "string", "jeudi": "string",
    "vendredi": "string", "samedi": "string", "dimanche": "string"
  },
  "conseils_generaux": "string (2-3 conseils généraux pour ce programme)"
}

Génère ${nbExercices} exercices par séance.
La durée totale des exercices d'une séance doit correspondre à environ ${config.duree} minutes.
Distribue les séances sur ${config.frequence} jours non consécutifs si possible, et indique "repos" pour les autres jours.`;
}

/** Résout un exercice généré : si "exerciceId" référence une entrée réelle du
 *  catalogue, reprend ses champs et recalcule series/repetitions/duree_secondes
 *  via niveau_config (même logique que ExerciceForm.handleNiveauChange() dans
 *  ProgrammePage.tsx). Si l'exerciceId est absent ou introuvable dans le
 *  catalogue (l'IA peut halluciner un id), repli sur un exercice "libre" :
 *  on garde le nom/les champs suggérés par l'IA plutôt que de planter. */
export function resoudreExercice(ex: ExerciceIA, catalogue: Exercice[]): ExerciceIA {
  if (!ex.exerciceId) return ex;

  const entry = catalogue.find(c => c.id === ex.exerciceId);
  if (!entry) {
    // Repli exercice libre : exerciceId halluciné, on garde le nom suggéré.
    const { exerciceId: _ignored, ...libre } = ex;
    return { ...libre, nom: ex.nom?.trim() || ex.exerciceId };
  }

  const niveauKey = (['1', '2', '3'].includes(String(ex.niveau)) ? String(ex.niveau) : '2') as '1' | '2' | '3';
  const cfg = entry.niveau_config?.[niveauKey];

  // Pour un exercice du catalogue, series/repetitions/duree_secondes viennent
  // TOUJOURS du niveau_config, jamais de ce que l'IA a pu suggérer (règle du
  // prompt : "n'invente pas ... ils seront recalculés automatiquement") —
  // pas de repli sur ex.series/etc. même si cfg?.repetitions est null
  // (ce qui signifie légitimement "ce niveau utilise une durée, pas des
  // répétitions", pas "valeur inconnue, garde celle de l'IA").
  return {
    nom: entry.nom,
    categorie: entry.categorie,
    description: entry.description,
    conseil_securite: entry.consigneSecurite,
    niveau: Number(niveauKey),
    series: cfg?.series ?? null,
    repetitions: cfg?.repetitions ?? null,
    duree_secondes: cfg?.duree_secondes ?? null,
    exerciceId: entry.id,
  };
}

export function validerEtResoudre(parsed: Partial<ProgrammeIA>, catalogue: Exercice[]): ProgrammeIA {
  if (!parsed.nom || typeof parsed.nom !== 'string') {
    throw new Error('Programme généré incomplet : nom manquant. Réessayez.');
  }
  if (!Array.isArray(parsed.seances) || parsed.seances.length === 0) {
    throw new Error('Programme généré incomplet : aucune séance. Réessayez.');
  }
  for (const s of parsed.seances) {
    if (!s.nom || !Array.isArray(s.exercices) || s.exercices.length === 0) {
      throw new Error('Programme généré incomplet : une séance est sans nom ou sans exercice. Réessayez.');
    }
  }

  return {
    nom: parsed.nom,
    description: parsed.description,
    objectif: parsed.objectif ?? '',
    message_motivation: parsed.message_motivation ?? '',
    niveau_global: parsed.niveau_global ?? 2,
    seances: parsed.seances.map(s => ({
      nom: s.nom,
      description: s.description,
      exercices: s.exercices.map(ex => resoudreExercice(ex, catalogue)),
    })),
    planning: parsed.planning ?? {},
    conseils_generaux: parsed.conseils_generaux,
  };
}

export async function genererProgrammeStructure(
  patient: Participant,
  config: ConfigGenerationIA,
  reponsesClarification: string,
  catalogue: Exercice[],
  dernierBilan: Bilan | null,
  programmesExistants: ProgrammeV2[],
): Promise<ProgrammeIA> {
  const prompt = construirePrompt(patient, config, reponsesClarification, catalogue, dernierBilan, programmesExistants);

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
    body: JSON.stringify({ prompt, model: 'claude-sonnet-4-6' }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Erreur API Claude (${response.status}): ${err}`);
  }

  const data = await response.json();
  const cleanText = String(data.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed: Partial<ProgrammeIA>;
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    throw new Error("L'IA a renvoyé une réponse invalide. Réessayez.");
  }

  return validerEtResoudre(parsed, catalogue);
}

// ─── Étape 3 — Mapping vers createProgramme() (useProgrammeV2.ts) ────────────

export interface PayloadCreateProgramme {
  nom: string;
  objectif?: string;
  messageMotivation?: string;
  type: TypeProgramme;
  seances: Array<{
    tempId: string;
    nom: string;
    description?: string;
    exercices: Array<{
      nom: string;
      categorie?: string;
      description?: string;
      conseilSecurite?: string;
      series?: number;
      repetitions?: number;
      dureeSecondes?: number;
    }>;
  }>;
  planning: Partial<Record<JourProgramme, string | null>>;
}

/** Convertit un ProgrammeIA (résolu) vers le payload exact attendu par
 *  createProgramme() (useProgrammeV2.ts) — extrait pour être testable
 *  indépendamment de la page (pas d'environnement DOM/RTL dans ce projet).
 *  `genererTempId` est injecté plutôt qu'un appel direct à uuidv4() pour que
 *  les tests puissent fournir des ids déterministes. */
export function versPayloadCreateProgramme(
  programme: ProgrammeIA,
  type: TypeProgramme,
  genererTempId: () => string,
): PayloadCreateProgramme {
  const seancesAvecId = programme.seances.map(s => ({ ...s, tempId: genererTempId() }));

  const planning: Partial<Record<JourProgramme, string | null>> = {};
  for (const jour of JOURS_PROGRAMME) {
    const nomSeance = programme.planning[jour];
    if (!nomSeance || nomSeance.toLowerCase() === 'repos') {
      planning[jour] = null;
    } else {
      const match = seancesAvecId.find(s => s.nom === nomSeance);
      planning[jour] = match ? match.tempId : null;
    }
  }

  return {
    nom: programme.nom,
    objectif: programme.objectif,
    messageMotivation: programme.message_motivation,
    type,
    seances: seancesAvecId.map(s => ({
      tempId: s.tempId,
      nom: s.nom,
      description: s.description,
      exercices: s.exercices.map(ex => ({
        nom: ex.nom,
        categorie: ex.categorie,
        description: ex.description,
        conseilSecurite: ex.conseil_securite,
        series: ex.series ?? undefined,
        repetitions: ex.repetitions ?? undefined,
        dureeSecondes: ex.duree_secondes ?? undefined,
      })),
    })),
    planning,
  };
}
