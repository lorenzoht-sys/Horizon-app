import { useState, useRef, useCallback, useEffect } from 'react';
import { Check } from 'lucide-react';
import { EtapesFormulaire } from '../ui/EtapesFormulaire';
import { BTN_PRINCIPAL, BTN_SECONDAIRE } from '../ui/boutonsFormulaire';
import { remonterEnHaut } from '../../utils/remonterEnHaut';
import { toast } from 'sonner';
import type { Participant } from '../../types';
import ParticipantForm, { type ParticipantFormHandle } from './ParticipantForm';
import { supprimerBrouillonParticipant } from '../../hooks/useBrouillonParticipant';

const STEPS = [
  'Identité & Coordonnées',
  'Profil de santé',
  'Mode de vie & Autonomie',
  'Objectifs & Organisation',
  'Récapitulatif',
];

interface Props {
  initial?: Partial<Participant>;
  draftKey: string;
  onSave: (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => void | Promise<void>;
  onCancel: () => void;
  isEdition?: boolean;
}

export default function ParticipantFormStepper({ initial, draftKey, onSave, onCancel, isEdition }: Props) {
  const [step, setStep] = useState(0);
  const [completion, setCompletion] = useState({ filled: 0, total: 1 });
  const [isSaving, setIsSaving] = useState(false);
  const formRef = useRef<ParticipantFormHandle>(null);
  const hautRef = useRef<HTMLDivElement>(null);
  const premierRendu = useRef(true);
  const LAST = STEPS.length - 1;

  // Compte rendu de Pierre (25/11/2026) : « Suivant » laissait la nouvelle
  // étape affichée en bas. La zone qui défile est la div de App.tsx, pas la
  // fenêtre : window.scrollTo n'y fait rien, on remonte donc le premier
  // parent qui défile réellement.
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    remonterEnHaut(hautRef.current);
  }, [step]);

  async function handleSubmit(data: Omit<Participant, 'id' | 'token' | 'bilans'>) {
    supprimerBrouillonParticipant(draftKey);
    setIsSaving(true);
    try {
      await onSave(data);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCreer() {
    if (isSaving) return;
    const resultat = formRef.current?.submit();
    if (resultat && resultat !== true) {
      toast.error(resultat.message);
      setStep(resultat.step - 1);
    }
  }

  const handleCompletionChange = useCallback((filled: number, total: number) => {
    setCompletion(prev => (prev.filled === filled && prev.total === total) ? prev : { filled, total });
  }, []);

  function handleAnnuler() {
    // Évite qu'un brouillon abandonné réapparaisse lors d'une prochaine création
    supprimerBrouillonParticipant(draftKey);
    onCancel();
  }

  const pct = completion.total > 0 ? Math.round((completion.filled / completion.total) * 100) : 0;

  return (
    <div ref={hautRef} className="max-w-2xl mx-auto charte-formulaire">
      <EtapesFormulaire etapes={STEPS} courante={step} onAller={setStep} />

      {/* Complétion : information, pas une note — discrète, en vert de marque. */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--trait)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--vert-horizon)' }} />
        </div>
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--encre-2)' }}>{completion.filled} / {completion.total} champs remplis</span>
      </div>

      {/* Plus de grand cadre blanc : chaque rubrique est une Carte (25/11/2026). */}
      <div className="mb-6">
        <ParticipantForm
          ref={formRef}
          step={(step + 1) as 1 | 2 | 3 | 4 | 5}
          initial={initial}
          draftKey={draftKey}
          onCompletionChange={handleCompletionChange}
          onSubmit={handleSubmit}
          onCancel={onCancel}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={step === 0 ? handleAnnuler : () => setStep(s => s - 1)}
          className={BTN_SECONDAIRE}
        >
          {step === 0 ? 'Annuler' : '← Précédent'}
        </button>

        {step < LAST ? (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Modification : enregistrer sans parcourir les cinq étapes (compte
                rendu de Pierre, 25/11/2026). Même submit() que le bouton final :
                l'état de toutes les étapes vit dans ParticipantForm, rien n'est
                perdu, et une erreur ramène à l'étape concernée. */}
            {isEdition && (
              <button
                onClick={handleCreer}
                disabled={isSaving}
                data-testid="enregistrer-modifications-etape"
                className={BTN_SECONDAIRE}
              >
                <Check size={16} />
                {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            )}
            <button
              onClick={() => setStep(s => s + 1)}
              className={BTN_PRINCIPAL}
            >
              Suivant →
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreer}
            disabled={isSaving}
            className={BTN_PRINCIPAL}
          >
            <Check size={16} />
            {isSaving ? 'Enregistrement...' : (isEdition ? 'Enregistrer les modifications' : 'Créer la fiche')}
          </button>
        )}
      </div>
    </div>
  );
}

