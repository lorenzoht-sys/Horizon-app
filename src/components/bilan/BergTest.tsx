import type { BergData, BergScore } from '../../types';
import { BERG_ITEMS, computeBergScore } from '../../data/berg';

interface Props {
  value: BergData | null | undefined;
  onChange: (v: BergData) => void;
}

export default function BergTest({ value, onChange }: Props) {
  const items = value?.items ?? Array(14).fill(null);

  function setItem(index: number, v: BergScore) {
    const next = [...items];
    next[index] = next[index] === v ? null : v;
    onChange({ items: next as (BergScore | null)[] });
  }

  const score = computeBergScore(value);
  const answered = items.filter(v => v !== null).length;

  return (
    <div className="space-y-3">
      {/* Progression */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <div className="text-xs text-gray-500">{answered}/14 items remplis</div>
        <div className="text-right">
          <span className="text-2xl font-bold text-dark">{score ?? '—'}</span>
          <span className="text-sm text-gray-400"> / 56</span>
        </div>
      </div>

      {/* Grille items */}
      {BERG_ITEMS.map(item => {
        const selected = items[item.index];
        return (
          <div key={item.index} className="border border-gray-100 rounded-xl p-3">
            <p id={`berg-item-${item.index}-label`} className="text-xs font-semibold text-gray-700 mb-2">
              {item.label}
            </p>
            <div role="group" aria-labelledby={`berg-item-${item.index}-label`} className="grid grid-cols-5 gap-1">
              {item.options.map(opt => {
                const isSelected = selected === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    aria-label={`${item.label} — score ${opt.v} : ${opt.label}`}
                    aria-pressed={isSelected}
                    onClick={() => setItem(item.index, opt.v)}
                    className={`rounded-lg border-2 p-1.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
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

      {answered === 14 && score !== null && (
        <div className="text-center text-sm font-semibold text-primary bg-primary/5 rounded-xl py-2">
          Score total Berg : {score} / 56
        </div>
      )}
    </div>
  );
}
