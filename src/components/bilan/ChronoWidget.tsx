import { useState, useRef, useEffect } from 'react';

// mode 'up-MMSS'  : chrono qui monte, affiche 00:00
// mode 'up-SScc'  : chrono qui monte, affiche 00.00 (centièmes)
// mode 'down-6min': compte à rebours 6 minutes, beep à la fin

type Mode = 'up-MMSS' | 'up-SScc' | 'down-6min';

interface Props {
  mode: Mode;
  onStop?: (seconds: number) => void;
  onEnd?: () => void;
}

export default function ChronoWidget({ mode, onStop, onEnd }: Props) {
  const INITIAL = mode === 'down-6min' ? 360_000 : 0;

  const [ms, setMs] = useState(INITIAL);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');

  const startRef  = useRef(0);
  const baseRef   = useRef(INITIAL);
  const rafRef    = useRef(0);
  const onStopRef = useRef(onStop);
  const onEndRef  = useRef(onEnd);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);
  useEffect(() => { onEndRef.current  = onEnd;  }, [onEnd]);

  function loop(now: number) {
    const elapsed = now - startRef.current;
    let current: number;

    if (mode === 'down-6min') {
      current = baseRef.current - elapsed;
      if (current <= 0) {
        baseRef.current = 0;
        setMs(0);
        setStatus('done');
        playBeep();
        onEndRef.current?.();
        return;
      }
    } else {
      current = baseRef.current + elapsed;
    }

    setMs(current);
    rafRef.current = requestAnimationFrame(loop);
  }

  function start() {
    if (status === 'done') return;
    startRef.current = performance.now();
    setStatus('running');
    rafRef.current = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    const elapsed = performance.now() - startRef.current;
    const current =
      mode === 'down-6min'
        ? Math.max(0, baseRef.current - elapsed)
        : baseRef.current + elapsed;
    baseRef.current = current;
    setMs(current);
    setStatus('paused');
    if (mode !== 'down-6min') {
      onStopRef.current?.(current / 1000);
    }
  }

  function reset() {
    cancelAnimationFrame(rafRef.current);
    baseRef.current = INITIAL;
    setMs(INITIAL);
    setStatus('idle');
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function format(val: number): string {
    if (mode === 'up-SScc') {
      const s  = Math.floor(val / 1000);
      const cs = Math.floor((val % 1000) / 10);
      return `${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    }
    const totalSec = Math.floor(val / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return (
    <div
      style={{ background: '#0D2B2B' }}
      className="rounded-xl p-4 flex flex-col items-center gap-3"
    >
      <div
        style={{ fontSize: 32, fontWeight: 700, color: 'white', fontFamily: 'monospace', letterSpacing: 2 }}
      >
        {format(ms)}
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
