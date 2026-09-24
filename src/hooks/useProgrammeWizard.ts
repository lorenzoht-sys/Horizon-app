import { useState } from 'react';
import { EMPTY_WIZARD, type WizardData } from '../components/programme/ProgrammeWizard';

// Orchestration du wizard programme (ProgrammeWizardModal), dupliquée à
// l'identique entre ProgrammePage.tsx (programme réel) et
// ModelesProgrammePage.tsx (modèle réutilisable) avant extraction : seuls
// l'appel de sauvegarde final (createProgramme/updateProgramme vs
// createModele/updateModele) et le mapper d'édition (progV2ToWizard vs
// progModeleToWizard) différaient — ils restent donc du ressort de la page
// appelante, pas de ce hook.
export function useProgrammeWizard() {
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(EMPTY_WIZARD);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function updateWizard(patch: Partial<WizardData>) {
    setWizardData(prev => ({ ...prev, ...patch }));
  }

  function openWizard() {
    setWizardData(EMPTY_WIZARD);
    setEditingId(null);
    setStep(1);
    setShowWizard(true);
  }

  function openEditWizard(id: string, data: WizardData) {
    setWizardData(data);
    setEditingId(id);
    setStep(1);
    setShowWizard(true);
  }

  function closeWizard() {
    setShowWizard(false);
    setEditingId(null);
    setStep(1);
  }

  // Enveloppe le cycle saving/fermeture-si-succès commun aux deux pages ;
  // l'appel réseau, le payload et les messages toast restent dans la page
  // (ils diffèrent : "programme" vs "modèle").
  async function handleSave(action: () => Promise<boolean>): Promise<boolean> {
    setSaving(true);
    try {
      const ok = await action();
      if (ok) closeWizard();
      return ok;
    } finally {
      setSaving(false);
    }
  }

  return {
    showWizard, step, setStep, wizardData, saving, editingId,
    isEditing: editingId != null,
    updateWizard, openWizard, openEditWizard, closeWizard, handleSave,
  };
}
