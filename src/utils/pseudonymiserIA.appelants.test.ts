// Non-fuite de l'identité, appelant par appelant (lot A pseudonymisation,
// 2026-10-27). Pour chacun des huit appelants de l'IA, on construit le prompt
// avec le bénéficiaire fictif complet et on vérifie qu'aucun identifiant n'y
// figure. Quand l'appelant fait lui-même l'appel réseau, c'est le corps
// réellement envoyé à /api/claude qui est inspecté (fetch simulé).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../lib/supabase', () => ({
  getAuthHeader: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
}));

import { genererInterpretation } from './genererInterpretation';
import { genererQuestionsClarification, genererProgrammeStructure } from './genererProgrammeIA';
import { suggererReformulation } from './reformulerMessageBeneficiaire';
import { buildChampsAcroFormPrompt } from './buildCompteRenduStructureContext';
import { buildActionPrompt, buildSystemPrompt, buildAssistantPromptMobile, historiquePourIA, masquerExtrasIA, type ActionType, type ContexteExtrasIA } from './promptAssistant';
import { construirePromptResumeEvolution } from './promptComparaison';
import { formatHistoriqueConversation } from './assistantContexte';
import { identiteDe, masquerIdentiteConnue, versParticipantIA } from './pseudonymiserIA';
import { beneficiaireFictif, identifiantsPresents } from './pseudonymiserIA.fixture';
import type { Programme, ProgrammeV2, Structure } from '../types';

const patient = beneficiaireFictif({
  programmes: [{
    id: 'prog-1', participantId: 'p-fictif', dateCreation: '', dateDebut: '', titre: 'Programme Équilibre E2E',
    objectif: 'Autonomie de E2E', messageMotivation: 'Bravo E2E Pseudotest', exercices: [], actif: true, suiviSemaines: [],
  }],
});
const identite = identiteDe(patient);

function fetchRepondant(texte: string) {
  const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: texte }) });
  vi.stubGlobal('fetch', mock);
  return mock;
}
function promptEnvoye(mock: ReturnType<typeof vi.fn>, appel = 0): string {
  return JSON.parse(mock.mock.calls[appel][1].body).prompt;
}

afterEach(() => vi.unstubAllGlobals());

describe('1. genererInterpretation (interprétation de bilan)', () => {
  it('n\'envoie pas l\'identité et réinsère le prénom dans le message', async () => {
    const mock = fetchRepondant(JSON.stringify({
      textePro: '{{BENEFICIAIRE}} progresse.', messageClient: 'Bonjour {{PRENOM}}, bravo.',
      pointsForts: [], pointsATravail: [], recommandations: [],
    }));
    const r = await genererInterpretation({
      participant: { prenom: patient.prenom, nom: patient.nom, age: 78, profil: 'Lombalgie' },
      notes: { equilibre: 3 }, valeurs: { tug: 12 },
    });
    expect(identifiantsPresents(promptEnvoye(mock))).toEqual([]);
    expect(promptEnvoye(mock)).toContain('{{PRENOM}}');
    expect(r.messageClient).toBe('Bonjour E2E, bravo.');
    expect(r.textePro).toBe('E2E Pseudotest progresse.');
  });
});

describe('2. genererProgrammeIA (questions et programme)', () => {
  it('questions de clarification : identité absente, réinsérée dans les questions', async () => {
    const mock = fetchRepondant(JSON.stringify({ questions: ['{{PRENOM}} monte-t-il les escaliers ?'] }));
    const q = await genererQuestionsClarification(patient);
    expect(identifiantsPresents(promptEnvoye(mock))).toEqual([]);
    expect(q).toEqual(['E2E monte-t-il les escaliers ?']);
  });

  it('programme : identité absente (y compris dans les réponses de clarification et les programmes existants)', async () => {
    const mock = fetchRepondant(JSON.stringify({
      nom: 'Programme Équilibre {{PRENOM}}', objectif: 'x', message_motivation: 'Courage {{PRENOM}}', niveau_global: 2,
      seances: [{ nom: 'A', exercices: [{ nom: 'Marche', categorie: 'endurance', description: '', niveau: 2 }] }],
      planning: {},
    }));
    const existants = [{ nom: 'Programme Force E2E' } as ProgrammeV2];
    const prog = await genererProgrammeStructure(
      patient, { objectif: 'équilibre', frequence: 2, duree: 30, niveau: 2 },
      'Q: E2E monte-t-il les escaliers ?\nR: oui, E2E Pseudotest monte seul', [], patient.bilans[0], existants,
      'E2E préfère le matin',
    );
    expect(identifiantsPresents(promptEnvoye(mock))).toEqual([]);
    expect(prog.nom).toBe('Programme Équilibre E2E');
    expect(prog.message_motivation).toBe('Courage E2E');
  });
});

const extras: ContexteExtrasIA = {
  compteRendus: [], notesManuelles: [],
  programme: { titre: 'Programme Équilibre E2E', objectif: 'Autonomie de E2E', messageMotivation: 'Bravo E2E', lignesExercices: [] },
};

describe('3. AssistantPage (contexte, comptes rendus, historique)', () => {
  const actions: ActionType[] = ['contre_indications', 'compte_rendu', 'compte_rendu_famille', 'interpretation', 'libre'];
  for (const action of actions) {
    it(`action « ${action} » : aucune identité dans le prompt`, () => {
      const prompt = buildActionPrompt(action, versParticipantIA(patient), masquerExtrasIA(extras, identite), null, { nom: 'EHPAD Test' });
      expect(identifiantsPresents(prompt)).toEqual([]);
    });
  }

  it('les titres des comptes rendus portent le marqueur, réinséré par la page', () => {
    const prompt = buildActionPrompt('compte_rendu_famille', versParticipantIA(patient), null);
    expect(prompt).toContain('## Bilan pour la famille — {{BENEFICIAIRE}}');
    expect(prompt).toContain('### Comment se porte {{PRENOM}} ?');
  });

  it('historique : réponses affichées (nom réinséré) et message de sélection ne renvoient pas le nom', () => {
    const historique: { role: 'user' | 'assistant'; content: string; contenuIA?: string }[] = [
      { role: 'user', content: 'E2E Pseudotest', contenuIA: '{{BENEFICIAIRE}}' },
      { role: 'assistant', content: '## Compte-rendu APA — E2E Pseudotest', contenuIA: '## Compte-rendu APA — {{BENEFICIAIRE}}' },
      // Restauré depuis assistant_logs : pas de contenuIA, le nom est dans le texte.
      { role: 'assistant', content: 'E2E va mieux, né le 14/03/1948.' },
      { role: 'user', content: 'Et pour E2E, quels exercices ?' },
    ];
    const sys = buildSystemPrompt(versParticipantIA(patient), masquerExtrasIA(extras, identite));
    const prompt = `${sys}\n${formatHistoriqueConversation(historiquePourIA(historique, identite))}\n${masquerIdentiteConnue('Comment va E2E Pseudotest ?', identite)}`;
    expect(identifiantsPresents(prompt)).toEqual([]);
  });
});

describe('4. AppMobile (assistant mobile, historique compris)', () => {
  it('aucune identité dans le prompt ni l\'historique', () => {
    const historique = historiquePourIA([
      { role: 'user', content: 'Bilan de E2E ?' },
      { role: 'assistant', content: 'E2E Pseudotest progresse.', contenuIA: '{{BENEFICIAIRE}} progresse.' },
    ], identite);
    const prompt = buildAssistantPromptMobile(versParticipantIA(patient), historique, masquerIdentiteConnue('Et E2E ?', identite));
    expect(identifiantsPresents(prompt)).toEqual([]);
    expect(prompt).toContain('PATIENT : le bénéficiaire, ');
  });
});

describe('5. ComparaisonPage (résumé d\'évolution)', () => {
  it('ne reçoit aucune identité et demande « Bravo {{PRENOM}} »', () => {
    const prompt = construirePromptResumeEvolution({ age: 78, nbMois: 6, nbBilans: 2, deltasTexte: 'TUG : 14s → 12s' });
    expect(identifiantsPresents(prompt)).toEqual([]);
    expect(prompt).toContain('Bravo {{PRENOM}},');
  });
});

describe('6. Formulaire de structure (buildChampsAcroFormPrompt)', () => {
  it('aucune identité, et consigne de marqueurs pour les champs Nom / Prénom / Date de naissance', () => {
    const prompt = buildChampsAcroFormPrompt({
      champs: [{ nom: 'Nom', type: 'text' }, { nom: 'Prénom', type: 'text' }, { nom: 'Date de naissance', type: 'text' }],
      patient, structure: { id: 's', nom: 'EHPAD Test', token: 't' } as unknown as Structure,
      contratActif: null, programmeActif: patient.programmes![0] as Programme, programmesV2: [],
    });
    expect(identifiantsPresents(prompt)).toEqual([]);
    for (const m of ['{{NOM}}', '{{PRENOM}}', '{{DATE_NAISSANCE}}', '{{BENEFICIAIRE}}']) expect(prompt).toContain(m);
  });
});

describe('7. reformulerMessageBeneficiaire', () => {
  it('avec l\'identité connue : masque à l\'aller, réinsère au retour', async () => {
    const mock = fetchRepondant('Bravo {{PRENOM}}, continue ainsi !');
    const r = await suggererReformulation('Bonjour E2E, résultat faible.', identite);
    expect(identifiantsPresents(promptEnvoye(mock))).toEqual([]);
    expect(r).toBe('Bravo E2E, continue ainsi !');
  });
});

describe('8. DicteePostSeance → analyser-seance', () => {
  // Composant React, pas d'environnement DOM dans ce projet : vérification
  // statique du corps envoyé. Le côté serveur (nomPatient ignoré, prompt sans
  // nom) est testé dans supabase/functions/analyser-seance/garde-prompt.test.ts.
  it('le corps de l\'appel ne contient plus le nom du bénéficiaire', () => {
    const source = readFileSync(fileURLToPath(new URL('../components/DicteePostSeance.tsx', import.meta.url)), 'utf8');
    const appel = source.slice(source.indexOf("functions.invoke('analyser-seance'"), source.indexOf('if (error) throw error;'));
    expect(appel).toContain('transcription');
    expect(appel).not.toMatch(/nomPatient\s*:/);
    expect(appel).not.toMatch(/participant\.(prenom|nom)\b/);
  });
});
