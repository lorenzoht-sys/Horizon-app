import { useState, useRef, useEffect } from 'react';

// Chrono dédié au TM6 : durée fixe (2-12 min) ou libre, avec pause/reprise.
// Composant séparé de ChronoWidget.tsx (partagé avec équilibre/TUG) pour ne pas
// risquer de casser ces autres tests.

export const DUREES_FIXES = [120, 240, 360, 480, 600, 720] as const;

export interface Tm6ChronoResult {
  dureeReelleSecondes: number;
  nbPauses: number;
  dureePausesSecondes: number;
  pausesDetail: { debutSecondes: number; dureeSecondes: number }[];
}

interface Props {
  dureeMode: 'fixe' | 'libre';
  dureeCibleSecondes: number;
  onTerminer: (result: Tm6ChronoResult) => void;
}

type Status = 'idle' | 'running' | 'paused' | 'done';

function formatMMSS(totalSecondes: number) {
  const t = Math.max(0, Math.round(totalSecondes));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function playBeep() {
  try {
    type AnyAudioContext = typeof AudioContext;
    const Ctx: AnyAudioContext =
      window.AudioContext ??
      (window as unknown as Record<string, AnyAudioContext>).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach(d => {
      const osc = ctx.createOscillator();
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

export default function Tm6ChronoWidget({ dureeMode, dureeCibleSecondes, onTerminer }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [elapsedSecondes, setElapsedSecondes] = useState(0);
  const [pausesDetail, setPausesDetail] = useState<{ debutSecondes: number; dureeSecondes: number }[]>([]);
  const [pauseEnCoursSecondes, setPauseEnCoursSecondes] = useState(0);

  const startRef = useRef(0);
  const baseElapsedRef = useRef(0);
  const pauseStartRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alerteJoueeRef = useRef(false);

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function tick() {
    const ecoule = baseElapsedRef.current + (performance.now() - startRef.current) / 1000;
    setElapsedSecondes(ecoule);
    if (dureeMode === 'fixe' && ecoule >= dureeCibleSecondes && !alerteJoueeRef.current) {
      alerteJoueeRef.current = true;
      playBeep();
    }
  }

  function demarrer() {
    startRef.current = performance.now();
    baseElapsedRef.current = 0;
    setElapsedSecondes(0);
    setStatus('running');
    intervalRef.current = setInterval(tick, 200);
  }

  function mettreEnPause() {
    clearTimer();
    baseElapsedRef.current = baseElapsedRef.current + (performance.now() - startRef.current) / 1000;
    pauseStartRef.current = performance.now();
    setPauseEnCoursSecondes(0);
    setStatus('paused');
    intervalRef.current = setInterval(() => {
      setPauseEnCoursSecondes((performance.now() - pauseStartRef.current) / 1000);
    }, 200);
  }

  function reprendre() {
    clearTimer();
    const dureePause = (performance.now() - pauseStartRef.current) / 1000;
    setPausesDetail(prev => [
      ...prev,
      { debutSecondes: baseElapsedRef.current, dureeSecondes: dureePause },
    ]);
    setPauseEnCoursSecondes(0);
    startRef.current = performance.now();
    setStatus('running');
    intervalRef.current = setInterval(tick, 200);
  }

  function terminer() {
    clearTimer();
    let pauses = pausesDetail;
    let dureeReelle = baseElapsedRef.current;
    if (status === 'running') {
      dureeReelle = baseElapsedRef.current + (performance.now() - startRef.current) / 1000;
    } else if (status === 'paused') {
      const dureePause = (performance.now() - pauseStartRef.current) / 1000;
      pauses = [...pausesDetail, { debutSecondes: baseElapsedRef.current, dureeSecondes: dureePause }];
      dureeReelle = baseElapsedRef.current;
    }
    setStatus('done');
    const dureePausesSecondes = pauses.reduce((acc, p) => acc + p.dureeSecondes, 0);
    onTerminer({
      dureeReelleSecondes: Math.round(dureeReelle),
      nbPauses: pauses.length,
      dureePausesSecondes: Math.round(dureePausesSecondes),
      pausesDetail: pauses.map(p => ({
        debutSecondes: Math.round(p.debutSecondes),
        dureeSecondes: Math.round(p.dureeSecondes),
      })),
    });
  }

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (status === 'running' || status === 'paused') {
      window.onbeforeunload = () => '';
    } else {
      window.onbeforeunload = null;
    }
    return () => {
      if (status === 'done' || status === 'idle') window.onbeforeunload = null;
    };
  }, [status]);

  const tempsAffiche = dureeMode === 'fixe'
    ? Math.max(0, dureeCibleSecondes - elapsedSecondes)
    : elapsedSecondes;
  const tempsEcoule = dureeMode === 'fixe' && elapsedSecondes >= dureeCibleSecondes;

  return (
    <div style={{ background: 'var(--color-ink)' }} className="rounded-xl p-4 flex flex-col items-center gap-3">
      <div style={{ fontFamily: 'monospace', color: 'white', fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>
        {formatMMSS(tempsAffiche)}
      </div>

      {status === 'paused' && (
        <span className="text-orange-300 text-sm font-semibold">
          En pause — {formatMMSS(pauseEnCoursSecondes)}
        </span>
      )}

      {pausesDetail.length > 0 && status !== 'idle' && (
        <span className="text-gray-300 text-xs">
          Pauses : {pausesDetail.length} · {formatMMSS(pausesDetail.reduce((a, p) => a + p.dureeSecondes, 0) + (status === 'paused' ? pauseEnCoursSecondes : 0))} d'arrêt
        </span>
      )}

      {tempsEcoule && status !== 'done' && (
        <span className="text-green-400 text-sm font-semibold animate-pulse">
          Temps écoulé — appuyez sur Terminer
        </span>
      )}

      {status === 'done' && (
        <span className="text-green-400 text-sm font-semibold">Test terminé</span>
      )}

      <div className="w-full flex flex-col gap-2">
        {status === 'idle' && (
          <button type="button" onClick={demarrer}
            style={{ background: '#1D9E75' }}
            className="w-full py-4 rounded-xl text-white text-base font-bold">
            ▶ Démarrer le test
          </button>
        )}

        {status === 'running' && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={mettreEnPause}
              style={{ background: '#F59E0B' }}
              className="py-4 rounded-xl text-white text-base font-bold">
              ⏸ Pause
            </button>
            <button type="button" onClick={terminer}
              style={{ background: '#E85050' }}
              className="py-4 rounded-xl text-white text-base font-bold">
              ■ Terminer
            </button>
          </div>
        )}

        {status === 'paused' && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={reprendre}
              style={{ background: '#1D9E75' }}
              className="py-4 rounded-xl text-white text-base font-bold">
              ▶ Reprendre
            </button>
            <button type="button" onClick={terminer}
              style={{ background: '#E85050' }}
              className="py-4 rounded-xl text-white text-base font-bold">
              ■ Terminer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
