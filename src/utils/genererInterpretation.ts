import type { InterpretationIA, NotesBilan } from '../types';
import { getAuthHeader } from '../lib/supabase';
import { CONSIGNE_MARQUEURS, MARQUEURS, LIBELLE_NEUTRE, identiteDe, reinsererIdentiteDans } from './pseudonymiserIA';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResultatsBilan {
  // null si la date de naissance est absente ou invalide (voir src/lib/age.ts).
  // prenom/nom restent dans le navigateur : ils ne servent qu'à réinsérer
  // l'identité dans la réponse (voir pseudonymiserIA.ts).
  participant: { prenom: string; nom: string; age: number | null; profil: string };
  notes: NotesBilan;
  valeurs: {
    equilibreD?: number | null; equilibreG?: number | null;
    chairStand?: number | null;
    handGripD?: number | null;  handGripG?: number | null;
    tug?: number | null;
    souplesse?: number | null;
    tm6Distance?: number | null;
    memoireImmediat?: number | null; memoireDiffere?: number | null;
  };
  douleur?: number | null;
  fatigue?: number | null;
  bilanPrecedentNotes?: NotesBilan | null;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const LABELS_NOTES: Record<keyof NotesBilan, string> = {
  equilibre:  'Équilibre unipodal',
  force:      'Force MI (Chair Stand)',
  handGrip:   'Force mains (HandGrip)',
  mobilite:   'Mobilité (TUG)',
  souplesse:  'Souplesse',
  endurance:  'Endurance (TM6)',
  memoire:    'Mémoire (Dubois)',
};

const LABELS_VALEURS: Record<string, string> = {
  equilibreD:      'Équilibre jambe droite (s)',
  equilibreG:      'Équilibre jambe gauche (s)',
  chairStand:      'Chair Stand 30s (reps)',
  handGripD:       'HandGrip droite (kg)',
  handGripG:       'HandGrip gauche (kg)',
  tug:             'TUG 3m (s)',
  souplesse:       'Souplesse (cm signé)',
  tm6Distance:     'TM6 distance (m)',
  memoireImmediat: 'Mémoire immédiate (/5)',
  memoireDiffere:  'Mémoire différée (/5)',
};

// ─── Construction du prompt ───────────────────────────────────────────────────

/** Ce que le prompt a le droit de lire : le type exclut prénom et nom, qui
 *  ne doivent jamais partir vers Anthropic. Exporté pour être testé. */
export type ResultatsBilanIA = Omit<ResultatsBilan, 'participant'> & {
  participant: Omit<ResultatsBilan['participant'], 'prenom' | 'nom'>;
};

export function construirePrompt(r: ResultatsBilanIA): string {
  const notesTexte = (Object.entries(r.notes) as [keyof NotesBilan, number | undefined][])
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${LABELS_NOTES[k]}: ${v}/5`)
    .join('\n');

  const valeursTexte = Object.entries(r.valeurs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `  ${LABELS_VALEURS[k] ?? k}: ${v}`)
    .join('\n');

  const comparaison = r.bilanPrecedentNotes
    ? `\nBILAN PRÉCÉDENT (pour comparaison) :\n${
        (Object.entries(r.bilanPrecedentNotes) as [keyof NotesBilan, number | undefined][])
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `  ${LABELS_NOTES[k]}: ${v}/5`)
          .join('\n')
      }`
    : "\nC'est le bilan initial (pas de bilan précédent pour comparer).";

  return `Tu es un expert en Activité Physique Adaptée (APA) certifié.
Analyse les résultats de bilan fonctionnel suivants et génère une interprétation professionnelle.

PATIENT : ${LIBELLE_NEUTRE}
  Âge : ${r.participant.age === null ? 'non renseigné' : `${r.participant.age} ans`}
  Profil : ${r.participant.profil}
  Douleur quotidienne : ${r.douleur ?? 'non renseigné'}/10
  Fatigue quotidienne : ${r.fatigue ?? 'non renseigné'}/10

NOTES DES TESTS (1 = très insuffisant · 5 = excellent) :
${notesTexte}

VALEURS BRUTES :
${valeursTexte}
${comparaison}

${CONSIGNE_MARQUEURS}

Réponds UNIQUEMENT en JSON valide (aucun backtick, aucun commentaire) avec cette structure exacte :
{
  "textePro": "Interprétation professionnelle en 3-5 phrases. Ton clinique et factuel. Mentionner points forts ET points faibles. Comparer au bilan précédent si disponible.",
  "messageClient": "Message motivant pour le patient en 2-3 phrases. Langage simple et positif. Commencer par 'Bonjour ${MARQUEURS.prenom},'.",
  "pointsForts": ["point fort 1", "point fort 2"],
  "pointsATravail": ["point à améliorer 1", "point à améliorer 2"],
  "recommandations": ["recommandation concrète 1", "recommandation concrète 2", "recommandation concrète 3"]
}`;
}

// ─── Appel API ────────────────────────────────────────────────────────────────

export async function genererInterpretation(
  resultats: ResultatsBilan
): Promise<InterpretationIA> {

  const { participant: { prenom, nom, ...participantIA }, ...reste } = resultats;
  const identite = identiteDe({ prenom, nom });
  const prompt = construirePrompt({ ...reste, participant: participantIA });

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
  const texte: string = data.text ?? '';

  try {
    const parsed = reinsererIdentiteDans(JSON.parse(texte), identite);
    return {
      textePro:        parsed.textePro        ?? '',
      messageClient:   parsed.messageClient   ?? '',
      pointsForts:     parsed.pointsForts     ?? [],
      pointsATravail:  parsed.pointsATravail  ?? [],
      recommandations: parsed.recommandations ?? [],
      genereParIA:     true,
      dateGeneration:  new Date().toISOString(),
    };
  } catch {
    return {
      textePro:        reinsererIdentiteDans(texte, identite),
      messageClient:   '',
      pointsForts:     [],
      pointsATravail:  [],
      recommandations: [],
      genereParIA:     true,
      dateGeneration:  new Date().toISOString(),
    };
  }
}

export type { ResultatsBilan };
