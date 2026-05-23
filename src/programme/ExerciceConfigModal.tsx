import { useState } from 'react';
import type { Exercice, ExerciceProgramme, NiveauExercice } from '../types';
import { X } from 'lucide-react';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_NUM = [1, 2, 3, 4, 5, 6, 7];

interface Props {
  exercice: Exercice;
  initial?: Partial<ExerciceProgramme>;
  onConfirm: (ep: Omit<ExerciceProgramme, 'ordre'>) => void;
  onClose: () => void;
}

export default function ExerciceConfigModal({ exercice, initial, onConfirm, onClose }: Props) {
  const [niveau, setNiveau] = useState<NiveauExercice>(initial?.niveau ?? 'debutant');
  const [series, setSeries] = useState(initial?.series ?? 3);
  const [repetitions, setRepetitions] = useState(initial?.repetitions ?? 10);
  const [dureeSecondes, setDureeSecondes] = useState(initial?.dureeSecondes ?? 30);
  const [modeRep, setModeRep] = useState<'rep' | 'duree'>(initial?.dureeSecondes ? 'duree' : 'rep');
  const [pause, setPause] = useState(initial?.pauseSecondes ?? 30);
  const [jours, setJours] = useState<number[]>(initial?.frequenceParSemaine ?? [1, 3, 5]);
  const [note, setNote] = useState(initial?.notePersonnalisee ?? '');

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
            <label className="block text-sm font-semibold text-dark mb-2">Niveau</label>
            <div className="grid grid-cols-3 gap-2">
              {(['debutant', 'intermediaire', 'avance'] as NiveauExercice[]).map(n => (
                <button
                  key={n}
                  onClick={() => setNiveau(n)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${niveau === n ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-primary/50'}`}
                >
                  {n === 'debutant' ? 'Débutant' : n === 'intermediaire' ? 'Intermédiaire' : 'Avancé'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 italic">{exercice.niveaux[niveau]}</p>
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
