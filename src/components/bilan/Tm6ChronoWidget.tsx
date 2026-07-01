import { useState, useRef, useEffect } from 'react';

// Chrono TM6 : le minuteur tourne en continu même pendant les pauses.
// Une pause enregistre son heure de début (au clic Pause) et sa durée
// (calculée au clic Reprendre). Le temps affiché est le temps réel écoulé.

interface Tm6ChronoResult {
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
  } catch {
    // audio non disponible
  }
}

export default function Tm6ChronoWidget({ dureeMode, dureeCibleSecondes, onTerminer }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [elapsedSecondes, setElapsedSecondes] = useState(0);
  const [pausesDetail, setPausesDetail] = useState<{ debutSecondes: number; dureeSecondes: number }[]>([]);
  // Moment (en secondes écoulées depuis le début) où la pause en cours a démarré
  const [pauseDebutSecondes, setPauseDebutSecondes] = useState<number | null>(null);

  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alerteJoueeRef = useRef(false);

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function tick() {
    const ecoule = (performance.now() - startRef.current) / 1000;
    setElapsedSecondes(ecoule);
    if (dureeMode === 'fixe' && ecoule >= dureeCibleSecondes && !alerteJoueeRef.current) {
      alerteJoueeRef.current = true;
      playBeep();
    }
  }

  function demarrer() {
    startRef.current = performance.now();
    alerteJoueeRef.current = false;
    setElapsedSecondes(0);
    setPausesDetail([]);
    setPauseDebutSecondes(null);
    setStatus('running');
    intervalRef.current = setInterval(tick, 200);
  }

  function mettreEnPause() {
    // Le chrono CONTINUE — on note juste le moment de début de pause
    const debutPause = (performance.now() - startRef.current) / 1000;
    setPauseDebutSecondes(debutPause);
    setStatus('paused');
  }

  function reprendre(currentPauseDebut: number) {
    const fin = (performance.now() - startRef.current) / 1000;
    const dureePause = fin - currentPauseDebut;
    setPausesDetail(prev => [
      ...prev,
      { debutSecondes: currentPauseDebut, dureeSecondes: dureePause },
    ]);
    setPauseDebutSecondes(null);
    setStatus('running');
  }

  function terminer() {
    clearTimer();
    const dureeReelle = (performance.now() - startRef.current) / 1000;
    let pauses = pausesDetail;
    if (status === 'paused' && pauseDebutSecondes !== null) {
      const dureePause = dureeReelle - pauseDebutSecondes;
      pauses = [...pausesDetail, { debutSecondes: pauseDebutSecondes, dureeSecondes: dureePause }];
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

  // Durée de la pause en cours (le chrono tourne donc elapsed continue de monter)
  const pauseEnCoursSecondes =
    status === 'paused' && pauseDebutSecondes !== null
      ? elapsedSecondes - pauseDebutSecondes
      : 0;

  return (
    <div style={{ background: 'var(--color-ink)' }} className="rounded-xl p-4 flex flex-col items-center gap-3">
      {/* Temps principal */}
      <div style={{ fontFamily: 'monospace', color: 'white', fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>
        {formatMMSS(tempsAffiche)}
      </div>

      {/* Indicateur pause en cours */}
      {status === 'paused' && (
        <span className="text-orange-300 text-sm font-semibold">
          ⏸ Pause en cours — {formatMMSS(pauseEnCoursSecondes)}
        </span>
      )}

      {/* Signal fin de temps */}
      {tempsEcoule && status !== 'done' && (
        <span className="text-green-400 text-sm font-semibold animate-pulse">
          Temps écoulé — appuyez sur Terminer
        </span>
      )}

      {status === 'done' && (
        <span className="text-green-400 text-sm font-semibold">Test terminé</span>
      )}

      {/* Boutons */}
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
            <button type="button" onClick={() => pauseDebutSecondes !== null && reprendre(pauseDebutSecondes)}
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

      {/* Liste des pauses enregistrées */}
      {(pausesDetail.length > 0 || status === 'paused') && status !== 'idle' && (
        <div className="w-full space-y-1">
          {pausesDetail.map((p, i) => (
            <div key={i} className="flex justify-between text-xs text-gray-300 px-1">
              <span>Pause {i + 1}</span>
              <span>{formatMMSS(p.dureeSecondes)} à {formatMMSS(p.debutSecondes)}</span>
            </div>
          ))}
          {status === 'paused' && pauseDebutSecondes !== null && (
            <div className="flex justify-between text-xs text-orange-300 px-1">
              <span>Pause {pausesDetail.length + 1} (en cours)</span>
              <span>{formatMMSS(pauseEnCoursSecondes)} à {formatMMSS(pauseDebutSecondes)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
