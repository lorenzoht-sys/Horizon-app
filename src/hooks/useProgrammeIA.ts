import { useState } from 'react';
import { EMPTY_CONFIG_IA, type ConfigIA } from '../components/programme/ProgrammeIA';
import type { ProgrammeIA } from '../utils/genererProgrammeIA';
import type { Participant } from '../types';
import { genererQuestionsClarification } from '../utils/genererProgrammeIA';

// Orchestration de la génération de programme par IA (ConfigIAModal +
// PreviewIAModal), dupliquée à l'identique entre ProgrammePage.tsx
// (desktop) et ParticipantProfile.tsx (mobile) avant extraction — même
// principe que useProgrammeWizard.ts. L'appel réseau réel (genererProgramme-
// Structure, via le paramètre `build`) et la sauvegarde finale (createProgramme)
// restent du ressort de la page appelante : ils dépendent du catalogue et
// des programmes existants, chargés différemment selon le contexte.
export function useProgrammeIA() {
  const [showConfigIA, setShowConfigIA] = useState(false);
  const [configIA, setConfigIA] = useState<ConfigIA>(EMPTY_CONFIG_IA);
  const [generatingIA, setGeneratingIA] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [savingIA, setSavingIA] = useState(false);

  // Questions de clarification — un échec au chargement n'empêche pas de
  // générer le programme (questionsIA reste un tableau vide).
  const [questionsIA, setQuestionsIA] = useState<string[]>([]);
  const [reponsesIA, setReponsesIA] = useState<string[]>([]);
  const [chargementQuestionsIA, setChargementQuestionsIA] = useState(false);
  const [precisionsLibresIA, setPrecisionsLibresIA] = useState('');

  const [showPreviewIA, setShowPreviewIA] = useState(false);
  const [programmePreview, setProgrammePreview] = useState<ProgrammeIA | null>(null);

  function updateConfigIA(patch: Partial<ConfigIA>) {
    setConfigIA(prev => ({ ...prev, ...patch }));
  }

  function updateReponseIA(index: number, valeur: string) {
    setReponsesIA(prev => {
      const next = [...prev];
      next[index] = valeur;
      return next;
    });
  }

  async function ouvrirConfigIA(participant: Participant) {
    setConfigIA(EMPTY_CONFIG_IA);
    setErrorIA(null);
    setShowConfigIA(true);
    setQuestionsIA([]);
    setReponsesIA([]);
    setPrecisionsLibresIA('');
    setChargementQuestionsIA(true);
    try {
      const questions = await genererQuestionsClarification(participant);
      setQuestionsIA(questions);
      setReponsesIA(questions.map(() => ''));
    } catch {
      setQuestionsIA([]);
    } finally {
      setChargementQuestionsIA(false);
    }
  }

  function fermerConfigIA() {
    setShowConfigIA(false);
    setErrorIA(null);
  }

  /** `build` appelle genererProgrammeStructure() avec les arguments propres
   *  à la page (catalogue, dernier bilan, programmes existants…). */
  async function genererProgramme(build: () => Promise<ProgrammeIA>) {
    setGeneratingIA(true);
    setErrorIA(null);
    try {
      const parsed = await build();
      setProgrammePreview(parsed);
      setShowConfigIA(false);
      setShowPreviewIA(true);
    } catch (err) {
      setErrorIA(err instanceof Error ? err.message : "Une erreur est survenue lors de la génération.");
    } finally {
      setGeneratingIA(false);
    }
  }

  function fermerPreviewIA() {
    setShowPreviewIA(false);
    setProgrammePreview(null);
  }

  function modifierConfigDepuisPreview() {
    setShowPreviewIA(false);
    setShowConfigIA(true);
  }

  async function regenererIA(build: () => Promise<ProgrammeIA>) {
    setShowPreviewIA(false);
    setProgrammePreview(null);
    setShowConfigIA(true);
    await genererProgramme(build);
  }

  /** `save` construit le payload et appelle createProgramme() ; retourne le
   *  succès pour que l'appelant affiche son propre toast. */
  async function handleValiderEtCreerIA(save: () => Promise<boolean>): Promise<boolean> {
    setSavingIA(true);
    try {
      const ok = await save();
      if (ok) {
        setShowPreviewIA(false);
        setProgrammePreview(null);
        setShowConfigIA(false);
        setConfigIA(EMPTY_CONFIG_IA);
      }
      return ok;
    } finally {
      setSavingIA(false);
    }
  }

  return {
    showConfigIA, configIA, generatingIA, errorIA, savingIA,
    questionsIA, reponsesIA, chargementQuestionsIA, precisionsLibresIA,
    showPreviewIA, programmePreview, setProgrammePreview, setShowPreviewIA,
    updateConfigIA, updateReponseIA, setPrecisionsLibresIA, setErrorIA,
    ouvrirConfigIA, fermerConfigIA, genererProgramme,
    fermerPreviewIA, modifierConfigDepuisPreview, regenererIA,
    handleValiderEtCreerIA,
  };
}
