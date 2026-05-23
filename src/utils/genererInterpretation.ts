import type { InterpretationIA, NotesBilan } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResultatsBilan {
  participant: { prenom: string; nom: string; age: number; profil: string };
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

function construirePrompt(r: ResultatsBilan): string {
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

PATIENT :
  Nom : ${r.participant.prenom} ${r.participant.nom}
  Âge : ${r.participant.age} ans
  Profil : ${r.participant.profil}
  Douleur quotidienne : ${r.douleur ?? 'non renseigné'}/10
  Fatigue quotidienne : ${r.fatigue ?? 'non renseigné'}/10

NOTES DES TESTS (1 = très insuffisant · 5 = excellent) :
${notesTexte}

VALEURS BRUTES :
${valeursTexte}
${comparaison}

Réponds UNIQUEMENT en JSON valide (aucun backtick, aucun commentaire) avec cette structure exacte :
{
  "textePro": "Interprétation professionnelle en 3-5 phrases. Ton clinique et factuel. Mentionner points forts ET points faibles. Comparer au bilan précédent si disponible.",
  "messageClient": "Message motivant pour le patient en 2-3 phrases. Langage simple et positif. Commencer par 'Bonjour ${r.participant.prenom},'.",
  "pointsForts": ["point fort 1", "point fort 2"],
  "pointsATravail": ["point à améliorer 1", "point à améliorer 2"],
  "recommandations": ["recommandation concrète 1", "recommandation concrète 2", "recommandation concrète 3"]
}`;
}

// ─── Appel API ────────────────────────────────────────────────────────────────

export async function genererInterpretation(
  resultats: ResultatsBilan,
  apiKey: string
): Promise<InterpretationIA> {

  const prompt = construirePrompt(resultats);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Erreur API Claude (${response.status}): ${err}`);
  }

  const data = await response.json();
  const texte: string = data.content?.[0]?.text ?? '';

  try {
    const clean = texte.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
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
      textePro:        texte,
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
