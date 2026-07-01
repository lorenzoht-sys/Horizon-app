import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { Participant, TestKey } from '../../types';

interface TestInfo {
  key: TestKey;
  label: string;
  description: string;
  categorie: 'physique' | 'endurance' | 'cognitif' | 'autonomie';
}

const TESTS_INFO: TestInfo[] = [
  { key: 'equilibre',  label: 'Équilibre unipodal',          description: 'Appui sur un pied — équilibre statique et risque de chute',       categorie: 'physique'  },
  { key: 'chairStand', label: 'Chair Stand 30s',              description: 'Lever de chaise répété — force des membres inférieurs',           categorie: 'physique'  },
  { key: 'handGrip',   label: 'Hand Grip',                   description: 'Dynamomètre — force de préhension, marqueur sarcopénie (EWGSOP2)', categorie: 'physique'  },
  { key: 'tug',        label: 'TUG 3m',                      description: 'Timed Up & Go — mobilité fonctionnelle et risque de chute (HAS)', categorie: 'physique'  },
  { key: 'souplesse',  label: 'Souplesse scapulaire',         description: 'Distance doigts/pieds — flexibilité postérieure',                 categorie: 'physique'  },
  { key: 'apley',      label: 'Apley Scratch Test',           description: 'Amplitude épaule en 4 niveaux — mobilité du membre supérieur',    categorie: 'physique'  },
  { key: 'tinetti',    label: 'Tinetti (POMA)',               description: 'Grille équilibre & marche gériatrique — score /28 (HAS chutes)', categorie: 'physique'  },
  { key: 'berg',       label: 'Berg Balance Scale',           description: 'Grille 14 items, score /56 — gold standard risque de chute',      categorie: 'physique'  },
  { key: 'marche10m',  label: 'Test de marche 10 m',         description: 'Vitesse de marche habituelle & max (m/s) — mobilité fonctionnelle', categorie: 'physique' },
  { key: 'eva',        label: 'Douleur EVA',                  description: 'Échelle numérique 0-10 — douleur ressentie au moment du bilan',   categorie: 'physique'  },
  { key: 'tm6',        label: 'TM6 — Marche 6 minutes',      description: 'Endurance cardio-respiratoire — distance, FC, SpO₂ (HAS)',        categorie: 'endurance' },
  { key: 'memoire',    label: 'Mémoire (Dubois MIS)',         description: 'Rappel libre et indicé — dépistage trouble mnésique',             categorie: 'cognitif'  },
  { key: 'moca',       label: 'MoCA (/30)',                   description: 'Montreal Cognitive Assessment — dépistage troubles cognitifs légers', categorie: 'cognitif' },
  { key: 'adl',        label: 'ADL / IADL (Katz)',           description: 'Autonomie de base (6) + instrumentale (8) — score total /14',     categorie: 'autonomie' },
];

const CATEGORIES: { key: TestInfo['categorie']; label: string }[] = [
  { key: 'physique',   label: 'Tests physiques' },
  { key: 'endurance',  label: 'Endurance' },
  { key: 'cognitif',   label: 'Cognitif' },
  { key: 'autonomie',  label: 'Autonomie' },
];

function computeDefauts(participant: Participant): TestKey[] {
  const age = Math.floor(
    (Date.now() - new Date(participant.dateNaissance).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  const defauts: TestKey[] = ['equilibre', 'chairStand', 'tug', 'tm6'];
  if (age >= 70) {
    defauts.push('tinetti', 'memoire', 'berg', 'moca', 'adl');
  }
  return defauts;
}

function hasCardioRespi(participant: Participant): boolean {
  return !!participant.tags?.includes('chronique');
}

interface Props {
  participant: Participant;
  onValider: (tests: TestKey[]) => void;
  onCancel: () => void;
}

export default function ModalSelectionTests({ participant, onValider, onCancel }: Props) {
  const [selected, setSelected] = useState<TestKey[]>(() => computeDefauts(participant));

  const alerteTm6 = hasCardioRespi(participant);

  function toggle(key: TestKey) {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function toutCocher() {
    setSelected(TESTS_INFO.map(t => t.key));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="font-heading font-bold text-dark text-xl">
            Quels tests pour {participant.prenom} ?
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Ces tests seront utilisés pour tous les bilans trimestriels. Vous pouvez en ajouter ponctuellement à chaque bilan.
          </p>
          <button
            type="button"
            onClick={toutCocher}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Tout cocher
          </button>
        </div>

        {/* Liste */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {CATEGORIES.map(cat => {
            const tests = TESTS_INFO.filter(t => t.categorie === cat.key);
            return (
              <div key={cat.key}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{cat.label}</p>
                <div className="space-y-2">
                  {tests.map(test => {
                    const isSelected = selected.includes(test.key);
                    const showWarning = test.key === 'tm6' && alerteTm6;
                    return (
                      <label
                        key={test.key}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => toggle(test.key)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-dark">{test.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{test.description}</div>
                          {showWarning && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1">
                              <AlertTriangle size={12} className="flex-shrink-0" />
                              Vérifier la contre-indication médicale avant d'effectuer ce test (pathologie cardio/respi).
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
          >
            Ignorer
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{selected.length} test{selected.length > 1 ? 's' : ''} sélectionné{selected.length > 1 ? 's' : ''}</span>
            <button
              type="button"
              onClick={() => onValider(selected)}
              disabled={selected.length === 0}
              className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Valider →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
