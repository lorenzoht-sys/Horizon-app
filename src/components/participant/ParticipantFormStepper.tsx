import { useState, useRef, useCallback, useEffect } from 'react';
import { Check } from 'lucide-react';
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
    <div ref={hautRef} className="max-w-2xl mx-auto">
      {/* Stepper header */}
      <div className="flex items-center mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 last:flex-none min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                i < step ? 'bg-success text-white' : i === step ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-xs mt-1 font-medium hidden sm:block text-center leading-tight max-w-[72px] ${
                i === step ? 'text-primary' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 min-w-2 ${i < step ? 'bg-success' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Indicateur mobile */}
      <p className="text-xs text-gray-400 text-center mb-4 sm:hidden">
        Étape {step + 1} / {STEPS.length} — {STEPS[step]}
      </p>

      {/* Barre de complétion */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{completion.filled} / {completion.total} champs remplis</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--color-teal)' : '#1A5F9E' }}
          />
        </div>
      </div>

      {/* Contenu de l'étape */}
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
          className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium"
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
                className="px-4 py-2.5 border border-success text-success rounded-xl font-semibold hover:bg-success/5 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Check size={16} />
                {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            )}
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-dark transition-colors"
            >
              Suivant →
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreer}
            disabled={isSaving}
            className="px-6 py-2.5 bg-success text-white rounded-xl font-semibold hover:bg-green-600 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            {isSaving ? 'Enregistrement...' : (isEdition ? 'Enregistrer les modifications' : 'Créer la fiche')}
          </button>
        )}
      </div>
    </div>
  );
}

function remonterEnHaut(depuis: HTMLElement | null) {
  let el = depuis?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: 0 });
      return;
    }
    el = el.parentElement;
  }
  window.scrollTo({ top: 0 });
}
