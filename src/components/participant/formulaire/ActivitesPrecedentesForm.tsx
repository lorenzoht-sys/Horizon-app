import type { ActivitePrecedente, NiveauActivite } from '../../../types';
import { CLS_CELL, CLS_LABEL, OPTIONS_ACTIVITES } from './communs';

// ─── ACTIVITÉS PRÉCÉDENTES (bulles + détails par activité) ─────────────────────

export function ActivitesPrecedentesForm({
  value,
  onChange,
}: {
  value: ActivitePrecedente[];
  onChange: (v: ActivitePrecedente[]) => void;
}) {
  const items = value ?? [];

  const toggleOption = (opt: string) => {
    const exists = items.some(i => i.nom === opt);
    onChange(exists ? items.filter(i => i.nom !== opt) : [...items, { nom: opt }]);
  };

  const upd = (idx: number, patch: Partial<ActivitePrecedente>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const removeAt = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const addCustom = () => onChange([...items, { nom: '' }]);

  return (
    <div>
      <label className={CLS_LABEL}>Activités pratiquées avant</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {OPTIONS_ACTIVITES.map(opt => {
          const selected = items.some(i => i.nom === opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleOption(opt)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                selected
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
              }`}
            >
              {opt}
              {selected && <span className="text-white/80 text-xs leading-none">✕</span>}
            </button>
          );
        })}
      </div>

      {items.map((item, idx) => {
        const isPredefined = OPTIONS_ACTIVITES.includes(item.nom);
        return (
          <div key={idx} className="border border-gray-100 rounded-xl p-3.5 mb-2 bg-gray-50">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              {isPredefined ? (
                <span className="text-xs font-bold text-gray-500">{item.nom}</span>
              ) : (
                <input
                  type="text"
                  value={item.nom}
                  onChange={e => upd(idx, { nom: e.target.value })}
                  placeholder="Activité personnalisée..."
                  className={`flex-1 ${CLS_CELL}`}
                />
              )}
              <button type="button" onClick={() => removeAt(idx)} aria-label="Supprimer"
                className="text-gray-400 hover:text-red-500 p-1 text-base leading-none flex-shrink-0">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={item.periode ?? ''}
                onChange={e => upd(idx, { periode: e.target.value })}
                placeholder="Période (ex : jusqu'à 45 ans)"
                className={`w-full ${CLS_CELL}`}
              />
              <div className="flex gap-1.5">
                {NIVEAUX_ACTIVITE.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => upd(idx, { niveau: item.niveau === n ? null : n })}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      item.niveau === n ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={addCustom}
        className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors">
        + Autre
      </button>
    </div>
  );
}

export const NIVEAUX_ACTIVITE: NiveauActivite[] = ['Loisir', 'Compétition', 'Professionnel'];
