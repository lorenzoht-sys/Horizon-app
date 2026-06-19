import { useState, useCallback, useEffect, useRef } from 'react';
import type { Bilan, Participant } from '../../types';
import { generateClientMessage } from '../../utils/generateClientMessage';
import {
  sauvegarderBrouillon, supprimerBrouillon, getBrouillon,
  syncBrouillonToSupabase, deleteBrouillonFromSupabase,
  type BrouillonBilan,
} from '../../hooks/useBrouillonBilan';
import { supabase } from '../../lib/supabase';
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
    tm6: {
      distanceMetres: null, fcAvant: null, fcApres: null, fc2min: null,
      spo2Avant: null, spo2Apres: null, spo22min: null, borgRPE: null,
      dureeMode: 'fixe', dureeCibleSecondes: 360, dureeReelleSecondes: null,
      nbPauses: 0, dureePausesSecondes: 0, notesPauses: '',
    },
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

  // ── États de sauvegarde ───────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'saving' | 'saved_local' | 'saved_cloud' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(brouillon ? 'saved_cloud' : 'idle');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(
    brouillon ? new Date(brouillon.dateDerniereModif) : null
  );
  const [praticienId, setPraticienId] = useState<string | null>(null);

  // Récupérer l'ID du praticien une seule fois
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setPraticienId(user.id);
    });
  }, []);

  // Autosave localStorage — debounce 800ms, skip first render
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sauvegarderBrouillon(participant.id, step, form);
      setLastSaveTime(new Date());
      setSaveStatus('saved_local');
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [form, step, participant.id]);

  // Sync Supabase toutes les 30 secondes
  useEffect(() => {
    if (!praticienId) return;
    const interval = setInterval(async () => {
      const current = getBrouillon(participant.id);
      if (!current) return;
      setSaveStatus('saving');
      const ok = await syncBrouillonToSupabase(participant.id, current, praticienId);
      setSaveStatus(ok ? 'saved_cloud' : 'saved_local');
      if (ok) setLastSaveTime(new Date());
    }, 30_000);
    return () => clearInterval(interval);
  }, [praticienId, participant.id]);

  // Sauvegarde synchrone avant fermeture de page (localStorage)
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
    // Nettoyage cloud (non bloquant)
    if (praticienId) {
      void deleteBrouillonFromSupabase(participant.id, praticienId);
    }
    onSave(form);
  }

  // Sync immédiate à chaque changement d'étape
  async function handleNextStep() {
    sauvegarderBrouillon(participant.id, step + 1, form);
    if (praticienId) {
      setSaveStatus('saving');
      const current = getBrouillon(participant.id);
      if (current) {
        const ok = await syncBrouillonToSupabase(participant.id, { ...current, etapeActuelle: step + 1 }, praticienId);
        setSaveStatus(ok ? 'saved_cloud' : 'saved_local');
        if (ok) setLastSaveTime(new Date());
      }
    }
    setStep(s => s + 1);
  }

  // ── Rendu étapes ──────────────────────────────────────────────────────────

  function renderInitialStep() {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          {/* Date du bilan */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date du bilan</label>
            <input
              type="date"
              value={form.date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => update({ date: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <p className="text-xs text-gray-400 mt-1.5">Par défaut : aujourd'hui. Modifiable pour dater un bilan antérieur.</p>
          </div>
          {/* Résumé patient lecture seule */}
          <div className="bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: '#1A5F9E' }}
            >
              {participant.prenom[0]}{participant.nom[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-dark">
                Bilan de {participant.prenom} {participant.nom}
              </p>
              <p className="text-xs text-gray-500">
                {Math.floor((Date.now() - new Date(participant.dateNaissance).getTime()) / 31557600000)} ans
                {participant.contexteClinic ? ` · ${participant.contexteClinic}` : ''}
              </p>
            </div>
          </div>
          <FormulaireBilanInitial
            participantId={participant.id}
            onFlat={handleFlat}
            initialFlat={form.bilanInitialData?.formulaireFlat}
          />
        </div>
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

        {/* Indicateur sauvegarde */}
        <div className="flex items-center gap-1.5 text-xs flex-1 justify-center">
          {saveStatus === 'saving' && (
            <><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-500">Sauvegarde...</span></>
          )}
          {saveStatus === 'saved_cloud' && lastSaveTime && (
            <><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-gray-400">☁️ Sauvegardé {lastSaveTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></>
          )}
          {saveStatus === 'saved_local' && lastSaveTime && (
            <><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-300" />
            <span className="text-gray-400">💾 Sauvegardé {lastSaveTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></>
          )}
          {saveStatus === 'error' && (
            <><span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-orange-500">⚠️ Sauvegarde locale</span></>
          )}
        </div>

        {step < LAST ? (
          <button
            onClick={handleNextStep}
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
