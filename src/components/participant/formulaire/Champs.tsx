import { CLS_INPUT, CLS_LABEL } from './communs';

// ─── ÉCHELLE 0-10 (douleur / fatigue) ──────────────────────────────────────────

export function Echelle10({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  const v = value ?? null;
  const getColor = (n: number) =>
    n === 0 ? '#3B6D11' : n <= 3 ? '#F59E0B' : n <= 6 ? '#EF8C00' : n <= 8 ? '#EF4444' : '#991B1B';
  const getLibelle = (n: number) =>
    n === 0 ? '😊 Aucune' : n <= 2 ? '🙂 Légère' : n <= 4 ? '😐 Modérée'
    : n <= 6 ? '😟 Importante' : n <= 8 ? '😣 Sévère' : '😭 Insupportable';

  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex gap-1">
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
          const active = v === n;
          const color = getColor(n);
          return (
            <button key={n} type="button"
              onClick={() => onChange(n)}
              style={{ borderColor: active ? color : undefined, background: active ? color : undefined }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                active ? 'text-white shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1.5">
        <span>0 — Aucune</span>
        <span>5 — Modérée</span>
        <span>10 — Insupportable</span>
      </div>
      {v !== null && (
        <p className="text-xs font-semibold mt-1" style={{ color: getColor(v) }}>
          {getLibelle(v)}
        </p>
      )}
    </div>
  );
}

// ─── TOGGLE OUI/NON ─────────────────────────────────────────────────────────────

export function ToggleOuiNon({
  value,
  onChange,
}: {
  value: 'oui' | 'non' | null | undefined;
  onChange: (v: 'oui' | 'non') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {(['oui', 'non'] as const).map(v => {
        const isActive = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1.5px solid',
              borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
              background: isActive ? '#2BBFBF' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#374151',
              fontWeight: isActive ? '600' : '400',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
            {v === 'oui' ? 'Oui' : 'Non'}
          </button>
        );
      })}
    </div>
  );
}

// ─── ÉCHELLE 1-5 ──────────────────────────────────────────────────────────────

export function Echelle5({
  label,
  aide,
  value,
  onChange,
}: {
  label: string;
  aide?: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => {
          const active = value === n;
          return (
            <button key={n} type="button" onClick={() => onChange(n)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                active ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {n}
            </button>
          );
        })}
      </div>
      {aide && <p className="text-xs text-gray-400 mt-1">{aide}</p>}
    </div>
  );
}

// ─── CHOIX UNIQUE (sélection simple, re-cliquer pour désélectionner) ───────────

export function ChoixUnique({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? null : opt)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
            {value === opt && <span className="text-white/80 text-xs leading-none">✕</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── CHOIX UNIQUE OU TEXTE LIBRE (bulles de suggestion + champ texte) ──────────

export function ChoixOuTexte({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  options: string[];
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Ou précisez...'}
        className={CLS_INPUT}
      />
    </div>
  );
}

// ─── CHOIX MULTIPLE (bulles + champ libre) ─────────────────────────────────────

export function ChoixMultiple({
  label,
  options,
  value,
  onChange,
  avecChampLibre,
  placeholderCustom,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  avecChampLibre?: boolean;
  placeholderCustom?: string;
}) {
  const selected = value ?? [];
  const predefined = selected.filter(s => options.includes(s));
  const customs = selected.filter(s => !options.includes(s));

  const toggle = (opt: string) =>
    onChange(
      predefined.includes(opt)
        ? [...predefined.filter(s => s !== opt), ...customs]
        : [...predefined, opt, ...customs]
    );

  const updateCustom = (idx: number, text: string) => {
    const next = customs.map((c, i) => (i === idx ? text : c));
    onChange([...predefined, ...next]);
  };

  const removeCustom = (idx: number) => {
    onChange([...predefined, ...customs.filter((_, i) => i !== idx)]);
  };

  const addCustom = () => {
    onChange([...predefined, ...customs, '']);
  };

  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              predefined.includes(opt)
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
            {predefined.includes(opt) && <span className="text-white/80 text-xs leading-none">✕</span>}
          </button>
        ))}
      </div>

      {avecChampLibre && (
        <div className="mt-1">
          {customs.map((custom, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={custom}
                onChange={e => updateCustom(idx, e.target.value)}
                placeholder={placeholderCustom ?? 'Activité personnalisée...'}
                className={`flex-1 ${CLS_INPUT}`}
              />
              <button
                type="button"
                onClick={() => removeCustom(idx)}
                aria-label="Supprimer"
                className="text-gray-400 hover:text-red-500 p-1 text-base leading-none flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCustom}
            className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors"
          >
            + Autre
          </button>
        </div>
      )}
    </div>
  );
}
