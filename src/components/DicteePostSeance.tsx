import { useState, useEffect, useCallback } from 'react';
import { X, Mic, MicOff, RefreshCw, CheckCircle, Plus, Trash2, PenLine } from 'lucide-react';
import type { Participant } from '../types';
import type { ExerciceRealise, CompteRenduSeanceInsert } from '../types/seance';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

interface Props {
  participant: Participant;
  onClose: () => void;
  onSave: (data: CompteRenduSeanceInsert) => Promise<void>;
}

type EtatDictee = 'idle' | 'recording' | 'processing' | 'review' | 'saving';

interface FormExercice {
  nom: string;
  series: string;
  repetitions: string;
  dureeSecondes: string;
  commentaire: string;
}

interface FormCR {
  dateSeance: string;
  dureeMinutes: string;
  exercicesRealises: FormExercice[];
  observations: string;
  douleursSignalees: string;
  humeurPatient: string;
  progression: string;
  pointsAttention: string;
  prochaineSeanceNotes: string;
}

interface AiFilledFields {
  dateSeance: boolean;
  dureeMinutes: boolean;
  exercicesRealises: boolean;
  observations: boolean;
  douleursSignalees: boolean;
  humeurPatient: boolean;
  progression: boolean;
  pointsAttention: boolean;
  prochaineSeanceNotes: boolean;
}

function emptyForm(): FormCR {
  return {
    dateSeance: new Date().toISOString().slice(0, 10),
    dureeMinutes: '',
    exercicesRealises: [],
    observations: '',
    douleursSignalees: '',
    humeurPatient: '',
    progression: '',
    pointsAttention: '',
    prochaineSeanceNotes: '',
  };
}

function allFalse(): AiFilledFields {
  return {
    dateSeance: false, dureeMinutes: false, exercicesRealises: false,
    observations: false, douleursSignalees: false, humeurPatient: false,
    progression: false, pointsAttention: false, prochaineSeanceNotes: false,
  };
}

function aiToFormData(ai: Record<string, unknown>): FormCR {
  const exercices = (ai.exercices_realises as any[] | undefined) ?? [];
  return {
    dateSeance: (ai.date_seance as string) ?? new Date().toISOString().slice(0, 10),
    dureeMinutes: ai.duree_minutes != null ? String(ai.duree_minutes) : '',
    exercicesRealises: exercices.map((e: any) => ({
      nom: e.nom ?? '',
      series: e.series != null ? String(e.series) : '',
      repetitions: e.repetitions != null ? String(e.repetitions) : '',
      dureeSecondes: e.duree_secondes != null ? String(e.duree_secondes) : '',
      commentaire: e.commentaire ?? '',
    })),
    observations: (ai.observations as string) ?? '',
    douleursSignalees: (ai.douleurs_signalees as string) ?? '',
    humeurPatient: (ai.humeur_patient as string) ?? '',
    progression: (ai.progression as string) ?? '',
    pointsAttention: (ai.points_attention as string) ?? '',
    prochaineSeanceNotes: (ai.prochaine_seance_notes as string) ?? '',
  };
}

function computeFilledFields(ai: Record<string, unknown>): AiFilledFields {
  const exercices = (ai.exercices_realises as any[] | undefined) ?? [];
  return {
    dateSeance: Boolean(ai.date_seance),
    dureeMinutes: ai.duree_minutes != null,
    exercicesRealises: exercices.length > 0,
    observations: Boolean(ai.observations),
    douleursSignalees: Boolean(ai.douleurs_signalees),
    humeurPatient: Boolean(ai.humeur_patient),
    progression: Boolean(ai.progression),
    pointsAttention: Boolean(ai.points_attention),
    prochaineSeanceNotes: Boolean(ai.prochaine_seance_notes),
  };
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function BadgeIA({ filled }: { filled: boolean }) {
  return filled
    ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">✓ Extrait auto</span>
    : <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">À compléter</span>;
}

function ChampLabel({ label, filled }: { label: string; filled: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <BadgeIA filled={filled} />
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors";
const areaCls  = `${inputCls} resize-none`;
const selCls   = `${inputCls} bg-white`;

export default function DicteePostSeance({ participant, onClose, onSave }: Props) {
  const [etat, setEtat]               = useState<EtatDictee>('idle');
  const [timer, setTimer]             = useState(0);
  const [formData, setFormData]       = useState<FormCR>(emptyForm());
  const [aiFields, setAiFields]       = useState<AiFilledFields>(allFalse());
  const [analysePending, setAnalysePending] = useState(false);
  const [erreurAnalyse, setErreurAnalyse]   = useState<string | null>(null);
  const [manualMode, setManualMode]   = useState(false);

  const {
    isRecording, finalTranscript, interimTranscript,
    isSupported, isIOS, error: speechError,
    startRecording, stopRecording, reset: resetSpeech,
  } = useSpeechRecognition();

  useEffect(() => {
    if (!isRecording) return;
    const iv = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [isRecording]);

  // Déclencher l'analyse dès que l'enregistrement s'est arrêté
  useEffect(() => {
    if (!isRecording && analysePending) {
      setAnalysePending(false);
      const text = finalTranscript.trim();
      if (text) analyserTranscription(text);
      else setEtat('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, analysePending]);

  const analyserTranscription = useCallback(async (transcription: string) => {
    setEtat('processing');
    setErreurAnalyse(null);

    if (!supabase) {
      setFormData({ ...emptyForm(), observations: transcription });
      setAiFields(allFalse());
      setErreurAnalyse("Supabase non configuré — analyse IA désactivée. Remplissez le formulaire manuellement.");
      setEtat('review');
      return;
    }

    try {
      const programmeActif = participant.programmes?.find(p => p.actif);
      const { data, error } = await supabase.functions.invoke('analyser-seance', {
        body: {
          transcription,
          nomPatient: `${participant.prenom} ${participant.nom}`,
          pathologie: participant.pathologie ?? null,
          objectifProgramme: programmeActif?.objectif ?? null,
          dateAujourdhui: new Date().toISOString().slice(0, 10),
        },
      });

      if (error) throw error;

      setFormData(aiToFormData(data as Record<string, unknown>));
      setAiFields(computeFilledFields(data as Record<string, unknown>));
    } catch (err) {
      console.error('Erreur analyse:', err);
      setErreurAnalyse("Erreur lors de l'analyse IA. Complétez le formulaire manuellement.");
      setFormData({ ...emptyForm(), observations: transcription });
      setAiFields(allFalse());
    } finally {
      setEtat('review');
    }
  }, [participant]);

  function handleToggleMic() {
    if (isRecording) {
      stopRecording();
      setAnalysePending(true);
    } else {
      resetSpeech();
      setTimer(0);
      setEtat('recording');
      startRecording();
    }
  }

  function handleRecommencer() {
    resetSpeech();
    setTimer(0);
    setFormData(emptyForm());
    setAiFields(allFalse());
    setErreurAnalyse(null);
    setManualMode(false);
    setEtat('idle');
  }

  async function handleValider() {
    setEtat('saving');
    try {
      const exercices: ExerciceRealise[] = formData.exercicesRealises.map(e => ({
        nom: e.nom,
        series: e.series ? parseInt(e.series) : null,
        repetitions: e.repetitions ? parseInt(e.repetitions) : null,
        dureeSecondes: e.dureeSecondes ? parseInt(e.dureeSecondes) : null,
        commentaire: e.commentaire || null,
      }));

      await onSave({
        participantId: participant.id,
        dateSeance: formData.dateSeance,
        dureeMinutes: formData.dureeMinutes ? parseInt(formData.dureeMinutes) : null,
        transcriptionBrute: finalTranscript.trim(),
        exercicesRealises: exercices,
        observations: formData.observations,
        douleursSignalees: formData.douleursSignalees || null,
        humeurPatient: (formData.humeurPatient as any) || null,
        progression: (formData.progression as any) || null,
        pointsAttention: formData.pointsAttention || null,
        prochaineSeanceNotes: formData.prochaineSeanceNotes || null,
      });

      toast.success('Séance enregistrée ✅');
      onClose();
    } catch (err) {
      console.error('Erreur sauvegarde:', err);
      toast.error("Erreur lors de l'enregistrement");
      setEtat('review');
    }
  }

  function updateExercice(index: number, field: keyof FormExercice, value: string) {
    setFormData(prev => {
      const updated = [...prev.exercicesRealises];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, exercicesRealises: updated };
    });
  }

  const isReview = etat === 'review' || manualMode;

  const transcriptionAffichee = finalTranscript + interimTranscript;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-heading font-bold text-dark text-base">🎙 Dicter une séance</h2>
            <p className="text-xs text-gray-400 mt-0.5">{participant.prenom} {participant.nom}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-dark p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── IDLE ──────────────────────────────────────────────── */}
          {etat === 'idle' && !manualMode && (
            <div className="flex flex-col items-center justify-center py-12 px-5">

              {!isSupported ? (
                <div className="mb-4 w-full max-w-sm bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                  <p className="text-sm font-semibold text-amber-800 mb-1">Navigateur non supporté</p>
                  <p className="text-xs text-amber-600 mb-3">La dictée vocale nécessite Chrome ou Edge.</p>
                  <button
                    onClick={() => { setManualMode(true); setEtat('review'); }}
                    className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary px-4 py-2 rounded-xl hover:bg-primary/5 transition-colors"
                  >
                    <PenLine size={12} /> Saisie manuelle
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleToggleMic}
                    className="relative flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shadow-lg mb-4"
                    style={{ width: 96, height: 96, minWidth: 96, minHeight: 96 }}
                    aria-label="Démarrer la dictée"
                  >
                    <i className="ti ti-microphone text-gray-500" style={{ fontSize: 38 }} aria-hidden="true" />
                  </button>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Dicter le compte-rendu</p>
                  <p className="text-xs text-gray-400 text-center max-w-xs leading-relaxed">
                    {isIOS
                      ? '🎙 Appuyez pour dicter. L\'enregistrement démarre automatiquement après chaque pause.'
                      : 'Appuyez sur le micro et parlez librement. Claude structurera vos notes automatiquement.'
                    }
                  </p>
                  {isIOS && (
                    <div className="mt-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-center">
                      <p className="text-[11px] text-blue-600 font-medium">Mode Safari iOS — sessions courtes actives</p>
                    </div>
                  )}
                  <button
                    onClick={() => { setManualMode(true); setEtat('review'); }}
                    className="mt-5 flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors"
                  >
                    <PenLine size={11} /> Saisie manuelle
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── RECORDING ─────────────────────────────────────────── */}
          {etat === 'recording' && (
            <div className="flex flex-col items-center px-5 py-8">
              <div className="relative mb-5">
                <span className="absolute inset-0 rounded-full bg-danger animate-ping opacity-40" />
                <button
                  onClick={handleToggleMic}
                  className="relative flex items-center justify-center rounded-full bg-danger hover:bg-danger transition-colors shadow-xl"
                  style={{ width: 96, height: 96, minWidth: 96, minHeight: 96 }}
                  aria-label="Arrêter l'enregistrement"
                >
                  <i className="ti ti-microphone text-white" style={{ fontSize: 38 }} aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-red-600">Enregistrement en cours… cliquer pour arrêter</p>
                {isIOS && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                    Safari iOS
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 font-mono mb-5">{formatTimer(timer)}</p>

              <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 min-h-[100px] max-h-[200px] overflow-y-auto">
                {transcriptionAffichee ? (
                  <p className="text-sm text-dark leading-relaxed">
                    <span>{finalTranscript}</span>
                    {interimTranscript && <span className="text-gray-400 italic">{interimTranscript}</span>}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">En attente de parole…</p>
                )}
              </div>

              {speechError && (
                <div className="mt-3 w-full bg-red-light border border-red-200 rounded-xl p-3">
                  <p className="text-xs text-red-600">{speechError}</p>
                </div>
              )}
            </div>
          )}

          {/* ── PROCESSING / SAVING ───────────────────────────────── */}
          {(etat === 'processing' || etat === 'saving') && (
            <div className="flex flex-col items-center justify-center py-16 px-5">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-gray-700">
                {etat === 'processing' ? 'Analyse en cours…' : 'Enregistrement…'}
              </p>
              {etat === 'processing' && (
                <p className="text-xs text-gray-400 mt-1">Claude structure votre dictée</p>
              )}
            </div>
          )}

          {/* ── REVIEW ────────────────────────────────────────────── */}
          {isReview && (
            <div className="px-5 py-4 space-y-5">

              {erreurAnalyse && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700">{erreurAnalyse}</p>
                </div>
              )}

              {finalTranscript.trim() && !manualMode && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Transcription</p>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 max-h-24 overflow-y-auto">
                    <p className="text-xs text-gray-600 italic leading-relaxed">"{finalTranscript.trim()}"</p>
                  </div>
                </div>
              )}

              {/* Date + Durée */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ChampLabel label="Date de la séance" filled={aiFields.dateSeance} />
                  <input
                    type="date"
                    value={formData.dateSeance}
                    onChange={e => setFormData(p => ({ ...p, dateSeance: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <ChampLabel label="Durée (min)" filled={aiFields.dureeMinutes} />
                  <input
                    type="number" min="0"
                    value={formData.dureeMinutes}
                    onChange={e => setFormData(p => ({ ...p, dureeMinutes: e.target.value }))}
                    placeholder="ex: 45"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Exercices */}
              <div>
                <ChampLabel label="Exercices réalisés" filled={aiFields.exercicesRealises} />
                <div className="space-y-2">
                  {formData.exercicesRealises.map((ex, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ex.nom}
                          onChange={e => updateExercice(i, 'nom', e.target.value)}
                          placeholder="Nom de l'exercice"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary transition-colors"
                        />
                        <button onClick={() => setFormData(p => ({ ...p, exercicesRealises: p.exercicesRealises.filter((_, idx) => idx !== i) }))} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { field: 'series' as const,        placeholder: 'Séries' },
                          { field: 'repetitions' as const,   placeholder: 'Rép.' },
                          { field: 'dureeSecondes' as const, placeholder: 'Durée (s)' },
                        ]).map(({ field, placeholder }) => (
                          <input
                            key={field}
                            type="number" min="0"
                            value={ex[field]}
                            onChange={e => updateExercice(i, field, e.target.value)}
                            placeholder={placeholder}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-primary text-center transition-colors"
                          />
                        ))}
                      </div>
                      <input
                        type="text"
                        value={ex.commentaire}
                        onChange={e => updateExercice(i, 'commentaire', e.target.value)}
                        placeholder="Commentaire (optionnel)"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => setFormData(p => ({ ...p, exercicesRealises: [...p.exercicesRealises, { nom: '', series: '', repetitions: '', dureeSecondes: '', commentaire: '' }] }))}
                    className="flex items-center gap-1.5 text-xs text-primary font-semibold border border-primary/30 px-3 py-2 rounded-xl hover:bg-primary/5 transition-colors w-full justify-center"
                  >
                    <Plus size={12} /> Ajouter un exercice
                  </button>
                </div>
              </div>

              {/* Observations */}
              <div>
                <ChampLabel label="Observations générales" filled={aiFields.observations} />
                <textarea rows={3} value={formData.observations} onChange={e => setFormData(p => ({ ...p, observations: e.target.value }))} placeholder="Observations sur la séance…" className={areaCls} />
              </div>

              {/* Humeur + Progression */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ChampLabel label="Humeur" filled={aiFields.humeurPatient} />
                  <select value={formData.humeurPatient} onChange={e => setFormData(p => ({ ...p, humeurPatient: e.target.value }))} className={selCls}>
                    <option value="">— Non précisé —</option>
                    <option value="très bien">😊 Très bien</option>
                    <option value="bien">🙂 Bien</option>
                    <option value="moyen">😐 Moyen</option>
                    <option value="fatigué">😓 Fatigué</option>
                  </select>
                </div>
                <div>
                  <ChampLabel label="Progression" filled={aiFields.progression} />
                  <select value={formData.progression} onChange={e => setFormData(p => ({ ...p, progression: e.target.value }))} className={selCls}>
                    <option value="">— Non précisé —</option>
                    <option value="en progrès">📈 En progrès</option>
                    <option value="stable">➡️ Stable</option>
                    <option value="régression">📉 Régression</option>
                  </select>
                </div>
              </div>

              {/* Douleurs */}
              <div>
                <ChampLabel label="Douleurs signalées" filled={aiFields.douleursSignalees} />
                <input type="text" value={formData.douleursSignalees} onChange={e => setFormData(p => ({ ...p, douleursSignalees: e.target.value }))} placeholder="Aucune douleur signalée" className={inputCls} />
              </div>

              {/* Points d'attention */}
              <div>
                <ChampLabel label="Points d'attention" filled={aiFields.pointsAttention} />
                <textarea rows={2} value={formData.pointsAttention} onChange={e => setFormData(p => ({ ...p, pointsAttention: e.target.value }))} placeholder="Alertes ou points à surveiller…" className={areaCls} />
              </div>

              {/* Notes prochaine séance */}
              <div>
                <ChampLabel label="Notes prochaine séance" filled={aiFields.prochaineSeanceNotes} />
                <textarea rows={2} value={formData.prochaineSeanceNotes} onChange={e => setFormData(p => ({ ...p, prochaineSeanceNotes: e.target.value }))} placeholder="À prévoir pour la prochaine séance…" className={areaCls} />
              </div>

              <div className="h-2" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white rounded-b-3xl sm:rounded-b-2xl">
          {etat === 'idle' && !manualMode && isSupported && (
            <button onClick={handleToggleMic} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors">
              <Mic size={16} /> Démarrer la dictée
            </button>
          )}

          {etat === 'recording' && (
            <button onClick={handleToggleMic} className="w-full flex items-center justify-center gap-2 bg-danger text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-danger transition-colors">
              <MicOff size={16} /> Arrêter et analyser
            </button>
          )}

          {isReview && (
            <div className="flex gap-3">
              <button onClick={handleRecommencer} className="flex items-center gap-1.5 border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                <RefreshCw size={14} /> Recommencer
              </button>
              <button onClick={handleValider} disabled={etat === 'saving'} className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-50">
                <CheckCircle size={16} /> Valider et enregistrer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
