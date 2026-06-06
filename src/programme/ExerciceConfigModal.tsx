import { useState } from 'react';
import type { Exercice, ExerciceProgramme, NiveauExercice } from '../types';
import { X } from 'lucide-react';

const NIVEAUX_UI = [
  { key: 'debutant' as NiveauExercice,      num: '1' as const, label: 'Facile',  emoji: '🟢', bg: '#D1FAE5', text: '#065F46', border: '#34D399' },
  { key: 'intermediaire' as NiveauExercice, num: '2' as const, label: 'Modéré', emoji: '🟡', bg: '#FEF3C7', text: '#92400E', border: '#FBBF24' },
  { key: 'avance' as NiveauExercice,        num: '3' as const, label: 'Intense', emoji: '🔴', bg: '#FEE2E2', text: '#991B1B', border: '#F87171' },
];

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_NUM = [1, 2, 3, 4, 5, 6, 7];

interface Props {
  exercice: Exercice;
  initial?: Partial<ExerciceProgramme>;
  onConfirm: (ep: Omit<ExerciceProgramme, 'ordre'>) => void;
  onClose: () => void;
  defaultNote?: string;
}

function initFromNiveauConfig(
  exercice: Exercice,
  n: NiveauExercice,
): { series: number; repetitions: number; dureeSecondes: number; modeRep: 'rep' | 'duree' } | null {
  const num = n === 'debutant' ? '1' : n === 'intermediaire' ? '2' : '3';
  const cfg = exercice.niveau_config?.[num];
  if (!cfg) return null;
  if (cfg.repetitions != null) {
    return { series: cfg.series, repetitions: cfg.repetitions, dureeSecondes: 30, modeRep: 'rep' };
  }
  if (cfg.duree_secondes != null) {
    return { series: cfg.series, repetitions: 10, dureeSecondes: cfg.duree_secondes, modeRep: 'duree' };
  }
  return { series: cfg.series, repetitions: 10, dureeSecondes: 30, modeRep: 'rep' };
}

export default function ExerciceConfigModal({ exercice, initial, onConfirm, onClose, defaultNote }: Props) {
  const defaultNiveau: NiveauExercice = initial?.niveau ?? 'intermediaire';
  const defaultInit = !initial && exercice.niveau_config
    ? initFromNiveauConfig(exercice, defaultNiveau)
    : null;

  const [niveau, setNiveau] = useState<NiveauExercice>(defaultNiveau);
  const [series, setSeries] = useState(initial?.series ?? defaultInit?.series ?? 3);
  const [repetitions, setRepetitions] = useState(initial?.repetitions ?? defaultInit?.repetitions ?? 10);
  const [dureeSecondes, setDureeSecondes] = useState(initial?.dureeSecondes ?? defaultInit?.dureeSecondes ?? 30);
  const [modeRep, setModeRep] = useState<'rep' | 'duree'>(initial?.dureeSecondes ? 'duree' : (defaultInit?.modeRep ?? 'rep'));
  const [pause, setPause] = useState(initial?.pauseSecondes ?? 30);
  const [jours, setJours] = useState<number[]>(initial?.frequenceParSemaine ?? [1, 3, 5]);
  const [note, setNote] = useState(initial?.notePersonnalisee ?? defaultNote ?? '');

  function handleNiveauChange(n: NiveauExercice) {
    setNiveau(n);
    const auto = initFromNiveauConfig(exercice, n);
    if (auto) {
      setSeries(auto.series);
      setRepetitions(auto.repetitions);
      setDureeSecondes(auto.dureeSecondes);
      setModeRep(auto.modeRep);
    }
  }

  const niveauUi = NIVEAUX_UI.find(x => x.key === niveau)!;
  const niveauNum = niveau === 'debutant' ? '1' : niveau === 'intermediaire' ? '2' : '3';
  const niveauCfg = exercice.niveau_config?.[niveauNum];

  function toggleJour(num: number) {
    setJours(prev =>
      prev.includes(num) ? prev.filter(j => j !== num) : [...prev, num].sort((a, b) => a - b)
    );
  }

  function handleConfirm() {
    const ep: Omit<ExerciceProgramme, 'ordre'> = {
      exerciceId: exercice.id,
      niveau,
      series,
      repetitions: modeRep === 'rep' ? repetitions : undefined,
      dureeSecondes: modeRep === 'duree' ? dureeSecondes : undefined,
      pauseSecondes: pause,
      frequenceParSemaine: jours,
      notePersonnalisee: note || undefined,
    };
    onConfirm(ep);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-heading font-bold text-dark">{exercice.nom}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Configurer pour ce programme</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-dark">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Niveau */}
          <div>
            <label className="block text-sm font-semibold text-dark mb-2">Niveau de difficulté</label>
            <div className="grid grid-cols-3 gap-2">
              {NIVEAUX_UI.map(n => (
                <button
                  key={n.key}
                  onClick={() => handleNiveauChange(n.key)}
                  style={niveau === n.key
                    ? { background: n.bg, border: `2px solid ${n.border}`, color: n.text }
                    : { background: 'white', border: '1px solid #E5E7EB', color: '#6B7280' }
                  }
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  {n.emoji} {n.label}
                </button>
              ))}
            </div>
            {niveauCfg ? (
              <div
                className="mt-2 rounded-lg px-3 py-2 text-xs"
                style={{ background: niveauUi.bg, color: niveauUi.text }}
              >
                <span className="font-semibold">{niveauCfg.description}</span>
                {niveauCfg.conseil && <span className="block mt-0.5 opacity-80">{niveauCfg.conseil}</span>}
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-2 italic">{exercice.niveaux[niveau]}</p>
            )}
          </div>

          {/* Mode rep vs durée */}
          <div>
            <label className="block text-sm font-semibold text-dark mb-2">Type d'exercice</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setModeRep('rep')}
                className={`py-2 rounded-lg text-xs font-medium border transition-colors ${modeRep === 'rep' ? 'bg-secondary text-white border-secondary' : 'border-gray-200 text-gray-600'}`}
              >
                Par répétitions
              </button>
              <button
                onClick={() => setModeRep('duree')}
                className={`py-2 rounded-lg text-xs font-medium border transition-colors ${modeRep === 'duree' ? 'bg-secondary text-white border-secondary' : 'border-gray-200 text-gray-600'}`}
              >
                Par durée
              </button>
            </div>
          </div>

          {/* Séries + reps/durée */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-dark mb-1">Séries</label>
              <input
                type="number" min={1} max={10} value={series}
                onChange={e => setSeries(+e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              {modeRep === 'rep' ? (
                <>
                  <label className="block text-xs font-semibold text-dark mb-1">Répétitions</label>
                  <input
                    type="number" min={1} max={50} value={repetitions}
                    onChange={e => setRepetitions(+e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </>
              ) : (
                <>
                  <label className="block text-xs font-semibold text-dark mb-1">Durée (secondes)</label>
                  <input
                    type="number" min={5} max={300} step={5} value={dureeSecondes}
                    onChange={e => setDureeSecondes(+e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </>
              )}
            </div>
          </div>

          {/* Pause */}
          <div>
            <label className="block text-xs font-semibold text-dark mb-1">Pause entre séries (secondes)</label>
            <input
              type="number" min={0} max={120} step={10} value={pause}
              onChange={e => setPause(+e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {/* Jours */}
          <div>
            <label className="block text-sm font-semibold text-dark mb-2">Jours de la semaine</label>
            <div className="flex gap-1 flex-wrap">
              {JOURS.map((j, i) => (
                <button
                  key={j}
                  onClick={() => toggleJour(JOURS_NUM[i])}
                  className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-colors ${jours.includes(JOURS_NUM[i]) ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-primary/50'}`}
                >
                  {j}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-dark mb-1">Note personnalisée (optionnel)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Message pour le patient sur cet exercice..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={jours.length === 0}
              className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ajouter au programme
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
