import React from 'react';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function ToggleField({ label, value, onChange, hint }: {
  label: string; value: boolean | null;
  onChange: (v: boolean | null) => void;
  hint?: string;
}) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: 'Oui' }, { v: false, label: 'Non' }, { v: null, label: 'NSP' },
  ];
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="flex gap-2">
        {opts.map(o => (
          <button key={String(o.v)} type="button"
            onClick={() => onChange(o.v)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              value === o.v ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const SCALE5_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#16A34A'];

export function Scale5({ label, value, onChange, hint }: {
  label: string; value: number | null;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button"
            onClick={() => onChange(n)}
            style={value === n ? { backgroundColor: SCALE5_COLORS[n - 1], color: 'white' } : undefined}
            className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
              value === n ? 'shadow-md scale-105' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {n}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function EVASlider({ label, value, onChange }: {
  label: string; value: number | null;
  onChange: (v: number) => void;
}) {
  const color = value === null ? '#9CA3AF' : value <= 3 ? '#22C55E' : value <= 6 ? '#F97316' : '#EF4444';
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span style={{ color }} className="text-lg font-bold">
          {value !== null ? `${value}/10` : '—'}
        </span>
      </div>
      <input type="range" min={0} max={10} step={1}
        value={value ?? 5}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        style={{ accentColor: color }}
      />
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>0 — Aucune</span><span>5</span><span>10 — Maximale</span>
      </div>
    </div>
  );
}

export function Pills<T extends string>({ label, value, onChange, options, hint }: {
  label: string; value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.value} type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              value === o.value
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function NumberField({ label, value, onChange, unit, min = 0, max = 999, hint }: {
  label: string; value: number | null;
  onChange: (v: number | null) => void;
  unit?: string; min?: number; max?: number; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max}
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="—"
          className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export function TextareaField({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
      />
    </div>
  );
}

export function InputField({ label, value, onChange, placeholder }: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="text" value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}

export function DateField({ label, value, onChange }: {
  label: string; value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="date" value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}

export function AlertBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-sm text-red-700 font-medium">
      <span>⚠️</span>
      <span>{message}</span>
    </div>
  );
}
