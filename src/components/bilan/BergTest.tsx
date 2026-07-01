import type { BergData, BergScore } from '../../types';
import { BERG_ITEMS, computeBergScore, bergRisque } from '../../data/berg';

interface Props {
  value: BergData | null | undefined;
  onChange: (v: BergData) => void;
}

const RISQUE_CONFIG = {
  eleve:  { label: 'Risque de chute élevé',    bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    dot: 'bg-red-500'    },
  modere: { label: 'Risque de chute modéré',   bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', dot: 'bg-orange-500' },
  faible: { label: 'Risque de chute faible',   bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700',  dot: 'bg-green-500'  },
};

export default function BergTest({ value, onChange }: Props) {
  const items = value?.items ?? Array(14).fill(null);

  function setItem(index: number, v: BergScore) {
    const next = [...items];
    next[index] = next[index] === v ? null : v;
    onChange({ items: next as (BergScore | null)[] });
  }

  const score = computeBergScore(value);
  const risque = bergRisque(score);
  const answered = items.filter(v => v !== null).length;

  return (
    <div className="space-y-4">
      {/* Barre de progression + score */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <div className="text-xs text-gray-500">
          {answered}/14 items remplis
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-dark">{score ?? '—'}</span>
          <span className="text-sm text-gray-400"> / 56</span>
        </div>
      </div>

      {/* Badge de risque */}
      {risque && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${RISQUE_CONFIG[risque].bg} ${RISQUE_CONFIG[risque].border} ${RISQUE_CONFIG[risque].text}`}>
          <span className={`w-2 h-2 rounded-full ${RISQUE_CONFIG[risque].dot}`} />
          {RISQUE_CONFIG[risque].label}
          {score !== null && (
            <span className="ml-1 font-normal opacity-70">
              {risque === 'eleve' && '(< 45)'}
              {risque === 'modere' && '(45-48)'}
              {risque === 'faible' && '(≥ 49)'}
            </span>
          )}
        </div>
      )}

      {/* Grille items */}
      <div className="space-y-3">
        {BERG_ITEMS.map(item => {
          const selected = items[item.index];
          return (
            <div key={item.index} className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">{item.label}</p>
              <div className="grid grid-cols-5 gap-1">
                {item.options.map(opt => {
                  const isSelected = selected === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setItem(item.index, opt.v)}
                      className={`rounded-lg border-2 p-1.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-white'
                          : 'border-gray-200 text-gray-600 hover:border-primary/40 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`font-bold text-base mb-0.5 ${isSelected ? 'text-white' : 'text-primary'}`}>{opt.v}</div>
                      <div className="text-[10px] leading-tight">{opt.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {answered === 14 && score !== null && (
        <div className="text-center text-sm font-semibold text-primary bg-primary/5 rounded-xl py-2">
          Score total Berg : {score} / 56
        </div>
      )}
    </div>
  );
}
