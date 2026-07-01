// Test de dépistage mémoire — Dubois MIS (Memory Impairment Screen)
// Dubois et al., 2002 — Protocol 5 mots / rappel immédiat / 5 min / rappel différé

import { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DuboisMISData {
  rappelImmediatLibre: number | null;
  rappelImmediatIndice: number | null;
  rappelDiffereLibre: number | null;
  rappelDiffereIndice: number | null;
  scoreImmediat: number | null;
  scoreDiffere: number | null;
  scoreMIS: number | null;
}

type Step = 'closed' | 'step1' | 'step2' | 'step3' | 'step4' | 'done';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MOTS = [
  { mot: 'MUSETTE',    indice: "C'est un type de sac" },
  { mot: 'SOLEIL',     indice: "C'est un astre" },
  { mot: 'MAIRIE',     indice: "C'est un bâtiment public" },
  { mot: 'MARGUERITE', indice: "C'est une fleur" },
  { mot: 'CAMION',     indice: "C'est un véhicule" },
];

const TIMER_INITIAL = 300; // 5 minutes en secondes

// ─── Calcul des scores ────────────────────────────────────────────────────────

function computeScores(
  rappelImmediatLibre: number | null,
  rappelImmediatIndice: number | null,
  rappelDiffereLibre: number | null,
  rappelDiffereIndice: number | null,
): DuboisMISData {
  const scoreImmediat =
    rappelImmediatLibre !== null
      ? rappelImmediatIndice !== null
        ? Math.max(rappelImmediatLibre, rappelImmediatIndice)
        : rappelImmediatLibre
      : null;

  const scoreDiffere =
    rappelDiffereLibre !== null
      ? rappelDiffereIndice !== null
        ? Math.max(rappelDiffereLibre, rappelDiffereIndice)
        : rappelDiffereLibre
      : null;

  const scoreMIS =
    scoreImmediat !== null && scoreDiffere !== null
      ? scoreImmediat + scoreDiffere
      : null;

  return {
    rappelImmediatLibre,
    rappelImmediatIndice,
    rappelDiffereLibre,
    rappelDiffereIndice,
    scoreImmediat,
    scoreDiffere,
    scoreMIS,
  };
}

function getMISInterpretation(score: number): { color: string; label: string } {
  if (score === 10) return { color: '#1D9E75', label: 'Mémoire normale ✅' };
  if (score >= 7)   return { color: '#F59E0B', label: 'Troubles légers — à surveiller' };
  if (score >= 5)   return { color: '#F59E0B', label: 'Seuil — consultation recommandée' };
  return { color: '#E85050', label: 'Troubles significatifs ⚠️' };
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function ScoreButtons({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-10 h-10 rounded-xl text-sm font-black border-2 transition-all ${
            value === n
              ? 'bg-primary border-primary text-white shadow-sm scale-105'
              : 'border-gray-200 text-gray-500 hover:border-primary/50 hover:bg-gray-50'
          }`}
        >
          {n}
        </button>
      ))}
      <span className="self-center text-xs text-gray-400 ml-1">/5</span>
    </div>
  );
}

function IndiciageSection({
  libre,
  indice,
  onIndice,
}: {
  libre: number;
  indice: number | null;
  onIndice: (v: number) => void;
}) {
  if (libre >= 5) return null;
  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800">
        Donner les indices catégoriels pour les mots manquants :
      </p>
      <div className="flex flex-col gap-1 text-xs text-amber-700">
        {MOTS.map(m => (
          <span key={m.mot}><strong>{m.indice}</strong> — quel était ce mot ?</span>
        ))}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <span className="text-xs text-gray-600">Score avec indices :</span>
        <ScoreButtons value={indice} onChange={onIndice} />
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  value: DuboisMISData | null | undefined;
  onChange: (v: DuboisMISData) => void;
}

export default function DuboisMISWidget({ value, onChange }: Props) {
  const hasResult = value?.scoreMIS != null;
  const [step, setStep] = useState<Step>(hasResult ? 'done' : 'closed');
  const [timer, setTimer] = useState(TIMER_INITIAL);
  const [timerRunning, setTimerRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer ──
  useEffect(() => {
    if (!timerRunning) return;
    intervalRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          setTimerRunning(false);
          setStep('step4');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning]);

  function startTimer() {
    setTimer(TIMER_INITIAL);
    setTimerRunning(true);
    setStep('step3');
  }

  function skipTimer() {
    setTimerRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStep('step4');
  }

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Setters ──
  const ril = value?.rappelImmediatLibre ?? null;
  const rii = value?.rappelImmediatIndice ?? null;
  const rdl = value?.rappelDiffereLibre ?? null;
  const rdi = value?.rappelDiffereIndice ?? null;

  function setRIL(v: number) {
    const updated = computeScores(v, rii, rdl, rdi);
    onChange(updated);
  }
  function setRII(v: number) {
    const updated = computeScores(ril, v, rdl, rdi);
    onChange(updated);
  }
  function setRDL(v: number) {
    const updated = computeScores(ril, rii, v, rdi);
    onChange(updated);
    if (step === 'step4') setStep('done');
  }
  function setRDI(v: number) {
    const updated = computeScores(ril, rii, rdl, v);
    onChange(updated);
    if (rdl !== null) setStep('done');
  }

  function restart() {
    onChange(computeScores(null, null, null, null));
    setStep('step1');
    setTimer(TIMER_INITIAL);
    setTimerRunning(false);
  }

  const mis = value?.scoreMIS;

  // ── Résultat résumé (si déjà complété) ──
  if (step === 'done' && mis != null) {
    const interp = getMISInterpretation(mis);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Test Dubois MIS</span>
          <button type="button" onClick={restart}
            className="text-xs text-primary hover:underline">
            Refaire le test
          </button>
        </div>

        <div className="rounded-xl border-2 p-4 flex items-center gap-4"
          style={{ borderColor: interp.color, background: `${interp.color}12` }}>
          <div className="text-center min-w-[64px]">
            <div className="text-3xl font-black" style={{ color: interp.color }}>{mis}</div>
            <div className="text-xs text-gray-500">/10</div>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: interp.color }}>{interp.label}</div>
            <div className="text-xs text-gray-500 mt-1">
              Immédiat : {value?.scoreImmediat ?? '—'}/5 · Différé : {value?.scoreDiffere ?? '—'}/5
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 italic">
          Test MIS — Dubois et al., 2002 · Score = 10/10 : mémoire normale · Score ≤ 4/10 : dépistage positif
        </p>
      </div>
    );
  }

  // ── Bouton d'entrée ──
  if (step === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setStep('step1')}
        className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-primary/40 text-primary text-sm font-semibold hover:border-primary hover:bg-primary/5 transition-all text-left flex items-center gap-2"
      >
        <span>🧠</span>
        <span>Réaliser le test Dubois (MIS)</span>
      </button>
    );
  }

  // ── Étape 1 : Présentation des 4 mots ──
  if (step === 'step1') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">🧠 Test Dubois MIS — Étape 1/4</span>
          <button type="button" onClick={() => setStep('closed')}
            className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
        </div>

        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Montrez ces 5 mots au patient
          </p>
          <div className="space-y-2">
            {MOTS.map(m => (
              <div key={m.mot} className="flex items-center gap-4 py-2 border-b border-slate-100 last:border-0">
                <span className="text-xl font-black text-slate-800 w-28">{m.mot}</span>
                <span className="text-sm text-slate-500 italic">{m.indice}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 italic mt-2">
            Laissez le patient lire et mémoriser pendant environ 1 minute.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStep('step2')}
          className="w-full px-4 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          ✓ Le patient a mémorisé → Rappel immédiat
        </button>
      </div>
    );
  }

  // ── Étape 2 : Rappel immédiat ──
  if (step === 'step2') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">🧠 Test Dubois MIS — Étape 2/4</span>
          <span className="text-xs text-gray-400">Rappel immédiat</span>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-700">Quels mots le patient se souvient-il ?</p>
          <ScoreButtons value={ril} onChange={setRIL} />

          {ril !== null && (
            <IndiciageSection libre={ril} indice={rii} onIndice={setRII} />
          )}
        </div>

        {ril !== null && (
          <button
            type="button"
            onClick={startTimer}
            className="w-full px-4 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            ⏱ Démarrer le délai de 5 minutes
          </button>
        )}
      </div>
    );
  }

  // ── Étape 3 : Timer 5 minutes ──
  if (step === 'step3') {
    const pct = ((TIMER_INITIAL - timer) / TIMER_INITIAL) * 100;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">🧠 Test Dubois MIS — Étape 3/4</span>
          <span className="text-xs text-gray-400">Intervalle</span>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-4 text-center">
          <p className="text-sm text-blue-700">
            Faire autre chose pendant 5 minutes avant le rappel différé.
          </p>
          <div className="text-5xl font-black text-primary tabular-nums">
            {formatTimer(timer)}
          </div>
          <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={skipTimer}
          className="w-full px-4 py-2.5 border-2 border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          ⏭ Passer le délai → Rappel différé
        </button>
      </div>
    );
  }

  // ── Étape 4 : Rappel différé ──
  if (step === 'step4') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">🧠 Test Dubois MIS — Étape 4/4</span>
          <span className="text-xs text-gray-400">Rappel différé</span>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Après 5 minutes, quels mots le patient se souvient-il ?
          </p>
          <ScoreButtons value={rdl} onChange={setRDL} />

          {rdl !== null && (
            <IndiciageSection libre={rdl} indice={rdi} onIndice={setRDI} />
          )}
        </div>

        {rdl !== null && (
          <button
            type="button"
            onClick={() => setStep('done')}
            className="w-full px-4 py-3 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            ✓ Terminer le test — Voir le score
          </button>
        )}
      </div>
    );
  }

  return null;
}
