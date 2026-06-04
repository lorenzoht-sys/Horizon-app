import { useState, useRef, useEffect } from 'react';

// mode 'up-MMSScc'  : chrono montant MM:SS.cc (équilibre, TUG)
// mode 'down-6min'  : compte à rebours 6 min MM:SS, beep à la fin
// mode 'down-30s'   : compte à rebours 30 sec, beep à la fin (variante TM6)

type Mode = 'up-MMSScc' | 'down-6min' | 'down-30s';

interface Props {
  mode: Mode;
  onStop?: (seconds: number) => void; // secondes avec 2 décimales
  onEnd?: () => void;
}

export default function ChronoWidget({ mode, onStop, onEnd }: Props) {
  const INITIAL = mode === 'down-6min' ? 360_000 : mode === 'down-30s' ? 30_000 : 0;
  const isCountdown = mode === 'down-6min' || mode === 'down-30s';

  const [ms, setMs]       = useState(INITIAL);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');

  const startRef  = useRef(0);
  const baseRef   = useRef(INITIAL);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStopRef = useRef(onStop);
  const onEndRef  = useRef(onEnd);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);
  useEffect(() => { onEndRef.current  = onEnd;  }, [onEnd]);

  function tick() {
    const elapsed = performance.now() - startRef.current;
    if (isCountdown) {
      const current = baseRef.current - elapsed;
      if (current <= 0) {
        setMs(0);
        setStatus('done');
        if (timerRef.current) clearInterval(timerRef.current);
        playBeep();
        onEndRef.current?.();
        return;
      }
      setMs(current);
    } else {
      setMs(baseRef.current + elapsed);
    }
  }

  function start() {
    if (status === 'done') return;
    startRef.current = performance.now();
    setStatus('running');
    timerRef.current = setInterval(tick, 10);
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    const elapsed = performance.now() - startRef.current;
    const current = isCountdown
      ? Math.max(0, baseRef.current - elapsed)
      : baseRef.current + elapsed;
    baseRef.current = current;
    setMs(current);
    setStatus('paused');
    if (!isCountdown) {
      onStopRef.current?.(parseFloat((current / 1000).toFixed(2)));
    }
  }

  function reset() {
    if (timerRef.current) clearInterval(timerRef.current);
    baseRef.current = INITIAL;
    setMs(INITIAL);
    setStatus('idle');
  }

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  function formatDisplay(val: number) {
    const total   = Math.max(0, val);
    const minutes = Math.floor(total / 60000);
    const secondes = Math.floor((total % 60000) / 1000);
    const centièmes = Math.floor((total % 1000) / 10);
    return {
      mmss: `${String(minutes).padStart(2, '0')}:${String(secondes).padStart(2, '0')}`,
      cc:   String(centièmes).padStart(2, '0'),
    };
  }

  const { mmss, cc } = formatDisplay(ms);

  return (
    <div
      style={{ background: 'var(--color-ink)' }}
      className="rounded-xl p-4 flex flex-col items-center gap-3"
    >
      <div style={{ fontFamily: 'monospace', color: 'white', display: 'flex', alignItems: 'baseline' }}>
        <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: 2 }}>{mmss}</span>
        {!isCountdown && (
          <span style={{ fontSize: 24, fontWeight: 700 }}>.{cc}</span>
        )}
      </div>

      {status === 'done' && (
        <span className="text-green-400 text-sm font-semibold animate-pulse">
          ⏰ Temps écoulé !
        </span>
      )}

      <div className="flex gap-2">
        {status !== 'running' ? (
          <button
            type="button"
            onClick={start}
            disabled={status === 'done'}
            style={{ background: '#1D9E75' }}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40"
          >
            ▶ Démarrer
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            style={{ background: '#E85050' }}
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
          >
            ⏹ Arrêter
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-gray-500 text-white text-sm font-semibold"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function playBeep() {
  try {
    type AnyAudioContext = typeof AudioContext;
    const Ctx: AnyAudioContext =
      window.AudioContext ??
      (window as unknown as Record<string, AnyAudioContext>).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach(d => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ctx.currentTime + d);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.25);
      osc.start(ctx.currentTime + d);
      osc.stop(ctx.currentTime + d + 0.25);
    });
  } catch (_) {}
}
