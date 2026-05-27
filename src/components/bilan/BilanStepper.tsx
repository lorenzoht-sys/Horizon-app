import { useState, useCallback, useEffect, useRef } from 'react';
import type { Bilan, Participant } from '../../types';
import { generateClientMessage } from '../../utils/generateClientMessage';
import { sauvegarderBrouillon, supprimerBrouillon, type BrouillonBilan } from '../../hooks/useBrouillonBilan';
import Step1_Identity from './steps/Step1_Identity';
import Step2_Physical from './steps/Step2_Physical';
import Step3_EnduranceMemory from './steps/Step3_EnduranceMemory';
import Step4_Notes from './steps/Step4_Notes';
import Step_ResultsIA from './steps/Step_ResultsIA';
import FormulaireBilanInitial, { type FormulaireFlat } from './FormulaireBilanInitial';
import { ALL_TESTS } from '../../data/profiles';
import { Check } from 'lucide-react';

type BilanForm = Omit<Bilan, 'id'>;

function emptyBilan(trimestre: number): BilanForm {
  return {
    date: new Date().toISOString().slice(0, 10),
    type: trimestre === 0 ? 'initial' : 'trimestriel',
    trimestre,
    equilibre: { droite: null, gauche: null },
    chairStand30: null,
    handGrip: { droite: null, gauche: null },
    tug3m: null,
    souplesse: { methode: 'assis', valeur: null },
    tm6: { distanceMetres: null, fcAvant: null, fcApres: null, fc2min: null, spo2Avant: null, spo2Apres: null, spo22min: null, borgRPE: null },
    memoire: { scoreImmediat: null, scoreDiffere: null },
    notesProfessionnelles: '', objectifsSuivants: '', pointsVigilance: '', messageClient: '',
    notesBilan: undefined,
    interpretationIA: null,
    ...(trimestre === 0 ? { bilanInitialData: {} } : {}),
  };
}

function mergerBrouillon(empty: BilanForm, data: Partial<BilanForm>): BilanForm {
  return {
    ...empty,
    ...data,
    equilibre: { ...empty.equilibre, ...data.equilibre },
    handGrip:  { ...empty.handGrip,  ...data.handGrip  },
    tm6:       { ...empty.tm6,       ...data.tm6       },
    souplesse: { ...empty.souplesse, ...data.souplesse },
    memoire:   { ...empty.memoire,   ...data.memoire   },
  };
}

const STEPS_INITIAL      = ['Bilan initial', 'Tests', 'Résultats & IA', 'Finalisation'];
const STEPS_TRIMESTRIEL  = ['Identification', 'Tests physiques', 'Endurance & Mémoire', 'Résultats & IA', 'Finalisation'];

interface Props {
  participant: Participant;
  onSave: (bilan: BilanForm) => void;
  onCancel: () => void;
  brouillon?: BrouillonBilan | null;
}

export default function BilanStepper({ participant, onSave, onCancel, brouillon }: Props) {
  const nextTrimestre = participant.bilans.length;
  const isInitial     = nextTrimestre === 0;

  const [step, setStep] = useState<number>(() => brouillon?.etapeActuelle ?? 0);
  const [form, setForm] = useState<BilanForm>(() => {
    const empty = emptyBilan(nextTrimestre);
    return brouillon?.data ? mergerBrouillon(empty, brouillon.data) : empty;
  });

  const STEPS = isInitial ? STEPS_INITIAL : STEPS_TRIMESTRIEL;
  const LAST  = STEPS.length - 1;
  const previous = participant.bilans.at(-1) ?? null;

  // Autosave — debounce 800ms, skip first render
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstRender = useRef(true);
  const [sauvegardeTime, setSauvegardeTime] = useState<string | null>(
    brouillon ? new Date(brouillon.dateDerniereModif).toTimeString().slice(0, 5) : null
  );

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sauvegarderBrouillon(participant.id, step, form);
      setSauvegardeTime(new Date().toTimeString().slice(0, 5));
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [form, step, participant.id]);

  // Sauvegarde synchrone avant fermeture de page
  const stepRef = useRef(step);
  const formRef = useRef(form);
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => {
    const handler = () => sauvegarderBrouillon(participant.id, stepRef.current, formRef.current);
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [participant.id]);

  function update(patch: Partial<BilanForm>) {
    setForm(f => ({ ...f, ...patch }));
  }

  const handleFlat = useCallback((flat: FormulaireFlat) => {
    setForm(f => ({
      ...f,
      bilanInitialData: { ...f.bilanInitialData, formulaireFlat: flat },
    }));
  }, []);

  function autoGenerateMessage() {
    update({ messageClient: generateClientMessage(participant.prenom, form as Bilan, previous, []) });
  }

  function handleSave() {
    clearTimeout(debounceRef.current);
    supprimerBrouillon(participant.id);
    onSave(form);
  }

  // ── Rendu étapes ──────────────────────────────────────────────────────────

  function renderInitialStep() {
    switch (step) {
      case 0: return (
        <FormulaireBilanInitial
          participantId={participant.id}
          onFlat={handleFlat}
          initialFlat={form.bilanInitialData?.formulaireFlat}
        />
      );
      case 1: return (
        <div className="space-y-8">
          <Step2_Physical form={form} update={update} previous={previous} testsActifs={ALL_TESTS} profilHandicap={participant.profilHandicap} />
          <div className="border-t border-gray-100 pt-6">
            <Step3_EnduranceMemory form={form} update={update} previous={previous} testsActifs={ALL_TESTS} profilHandicap={participant.profilHandicap} />
          </div>
        </div>
      );
      case 2: return <Step_ResultsIA form={form} update={update} participant={participant} previous={previous} />;
      case 3: return <Step4_Notes form={form} update={update} onGenerateMessage={autoGenerateMessage} />;
    }
  }

  function renderTrimestrielStep() {
    switch (step) {
      case 0: return <Step1_Identity form={form} update={update} nextTrimestre={nextTrimestre} />;
      case 1: return <Step2_Physical form={form} update={update} previous={previous} testsActifs={participant.testsActifs} profilHandicap={participant.profilHandicap} />;
      case 2: return <Step3_EnduranceMemory form={form} update={update} previous={previous} testsActifs={participant.testsActifs} profilHandicap={participant.profilHandicap} />;
      case 3: return <Step_ResultsIA form={form} update={update} participant={participant} previous={previous} />;
      case 4: return <Step4_Notes form={form} update={update} onGenerateMessage={autoGenerateMessage} />;
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Stepper header */}
      <div className="flex items-center mb-8 overflow-x-auto pb-1">
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

      {/* Contenu */}
      <div className={`mb-6 ${isInitial && step === 0 ? '' : 'bg-white rounded-2xl border border-gray-100 p-6'}`}>
        {isInitial ? renderInitialStep() : renderTrimestrielStep()}
      </div>

      {/* Navigation + indicateur sauvegarde */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={step === 0 ? onCancel : () => setStep(s => s - 1)}
          className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors font-medium"
        >
          {step === 0 ? 'Annuler' : '← Retour'}
        </button>

        {/* Indicateur sauvegarde automatique */}
        {sauvegardeTime && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-1 justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            Sauvegardé à {sauvegardeTime}
          </div>
        )}

        {step < LAST ? (
          <button
            onClick={() => setStep(s => s + 1)}
            className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-dark transition-colors"
          >
            Suivant →
          </button>
        ) : (
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-success text-white rounded-xl font-semibold hover:bg-green-600 transition-colors flex items-center gap-2"
          >
            <Check size={16} />
            Enregistrer le bilan
          </button>
        )}
      </div>
    </div>
  );
}
