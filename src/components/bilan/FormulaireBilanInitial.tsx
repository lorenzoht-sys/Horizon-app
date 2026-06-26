import { useState, useEffect, useCallback } from 'react';
import { getBilanEnCoursKey } from '../../hooks/useBrouillonBilan';

// ─── Types ──────────────────────────────────────────────────────────────────

type OuiNon = 'oui' | 'non';

type QuestionType =
  | 'text' | 'date' | 'number' | 'tel' | 'email' | 'oui-non'
  | 'echelle-10' | 'echelle-5' | 'choix-unique' | 'choix-multiple'
  | 'textarea' | 'time'
  | 'operations-list';

interface Question {
  id: string;
  label: string;
  type: QuestionType;
  obligatoire?: boolean;
  options?: string[];
  placeholder?: string;
  avecChampLibre?: boolean;
  conditionnelSi?: string;   // 'field_valeur'
  aide?: string;             // texte d'aide affiché sous la question
  alerteSi?: string[];       // valeurs qui déclenchent une alerte
  alerteMessage?: string;
}

interface BlocConditionnel {
  id: string;
  titre: string;
  questionCle?: { label: string; field: string };
  afficherSi?: OuiNon;
  questions: Question[];
}

export interface FormulaireFlat {
  data: Record<string, any>;
  reponsesClés: Record<string, OuiNon | null>;
}

// ─── Interfaces listes dynamiques ────────────────────────────────────────────

export interface OperationMedicale {
  id: string;
  type: string;
  date?: string;
  coteOpere?: 'droit' | 'gauche' | 'bilateral' | null;
  complication?: boolean;
  complicationDetail?: string;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── BLOCS ──────────────────────────────────────────────────────────────────

const BLOCS: BlocConditionnel[] = [
  // ─── CONDITIONNELS ───────────────────────────────────────────────────────

  {
    id: 'postOp',
    titre: '🏥 Opération(s) récente(s)',
    questionCle: { label: 'A-t-il été opéré récemment (< 12 mois) ?', field: 'aOperationRecente' },
    afficherSi: 'oui',
    questions: [
      { id: 'operations',    label: 'Opération(s)',              type: 'operations-list' },
      { id: 'autorisationAPA', label: 'Autorisation médicale APA ?', type: 'oui-non' },
      { id: 'kineEnCours',     label: 'Kiné en parallèle ?',        type: 'oui-non' },
      { id: 'douleurPostOp',   label: 'Douleur actuelle (EVA 0-10)', type: 'echelle-10' },
      {
        id: 'appareillage',
        label: 'Appareillage en cours',
        type: 'choix-unique',
        options: ['Aucun', 'Attelle', 'Béquilles', 'Autre'],
      },
    ],
  },

  {
    id: 'blessure',
    titre: '🤕 Blessure en cours',
    questionCle: { label: 'A-t-il une blessure ou douleur chronique en cours ?', field: 'aBlessure' },
    afficherSi: 'oui',
    questions: [
      { id: 'typeBlessure',         label: 'Type de blessure',          type: 'text',       placeholder: 'Entorse, tendinite, hernie discale...' },
      { id: 'localisationBlessure', label: 'Localisation',              type: 'text',       placeholder: 'Genou droit, épaule gauche...' },
      { id: 'mecanismeBlessure',    label: 'Mécanisme',                 type: 'choix-unique', options: ['Traumatique (choc)', 'Surmenage (progressif)', 'Autre'] },
      { id: 'douleurBlessure',      label: 'Douleur au repos (0-10)',   type: 'echelle-10' },
      { id: 'douleurEffort',        label: "Douleur à l'effort (0-10)", type: 'echelle-10' },
    ],
  },

  // ─── CONTRE-INDICATIONS (toujours affiché) ──────────────────────────────

  {
    id: 'mesuresCliniques',
    titre: '📊 Mesures cliniques',
    questions: [
      { id: 'fcMax',       label: 'FC max autorisée (si prescrite)', type: 'number', placeholder: '130' },
      { id: 'spo2Repos',         label: 'SpO₂ au repos (%)',        type: 'number' },
      { id: 'tensionArterielle', label: 'Tension artérielle connue', type: 'text', placeholder: '130/80' },
    ],
  },
];

// ─── Listes dynamiques ────────────────────────────────────────────────────────

const INPUT_CLS = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary';

function ListeOperations({
  value,
  onChange,
}: {
  value: OperationMedicale[];
  onChange: (v: OperationMedicale[]) => void;
}) {
  const ops = value ?? [];

  const add = () =>
    onChange([...ops, { id: genId(), type: '', date: '', coteOpere: null, complication: false }]);
  const remove = (id: string) => onChange(ops.filter(o => o.id !== id));
  const upd = (id: string, patch: Partial<OperationMedicale>) =>
    onChange(ops.map(o => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <div>
      {ops.map((op, i) => (
        <div key={op.id} className="border border-gray-100 rounded-xl p-4 mb-3 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Opération {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(op.id)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              🗑️ Supprimer
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Type d'opération</label>
              <input
                type="text"
                value={op.type}
                onChange={e => upd(op.id, { type: e.target.value })}
                placeholder="PTH droite, Ligaments croisés genou gauche..."
                className={`w-full ${INPUT_CLS}`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date (optionnel)</label>
                <input
                  type="date"
                  value={op.date ?? ''}
                  onChange={e => upd(op.id, { date: e.target.value })}
                  className={`w-full ${INPUT_CLS}`}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Côté opéré</label>
                <div className="flex gap-1.5">
                  {(['droit', 'gauche', 'bilateral'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => upd(op.id, { coteOpere: op.coteOpere === v ? null : v })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        op.coteOpere === v
                          ? 'bg-primary text-white border-primary'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {v === 'droit' ? 'D' : v === 'gauche' ? 'G' : 'Bil.'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Complication ou anomalie post-op ?
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => upd(op.id, { complication: true })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid',
                    borderColor: op.complication === true ? '#2BBFBF' : '#D1D5DB',
                    background: op.complication === true ? '#2BBFBF' : '#FFFFFF',
                    color: op.complication === true ? '#FFFFFF' : '#374151',
                    fontWeight: op.complication === true ? '600' : '400',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Oui
                </button>
                <button
                  type="button"
                  onClick={() => upd(op.id, { complication: false, complicationDetail: '' })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid',
                    borderColor: op.complication === false ? '#2BBFBF' : '#D1D5DB',
                    background: op.complication === false ? '#2BBFBF' : '#FFFFFF',
                    color: op.complication === false ? '#FFFFFF' : '#374151',
                    fontWeight: op.complication === false ? '600' : '400',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Non
                </button>
              </div>
              {op.complication === true && (
                <input
                  type="text"
                  value={op.complicationDetail ?? ''}
                  onChange={e => upd(op.id, { complicationDetail: e.target.value })}
                  placeholder="Précisez..."
                  className={`w-full ${INPUT_CLS}`}
                />
              )}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        + Ajouter une opération
      </button>
    </div>
  );
}

// ─── Composants UI de base ────────────────────────────────────────────────────

const SCALE5_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#16A34A'];

function BoutonOuiNon({
  value,
  onChange,
}: {
  value: OuiNon | boolean | null | undefined;
  onChange: (v: OuiNon) => void;
}) {
  // Normalise boolean/string legacy values : true → 'oui', false → 'non'
  const normalized: OuiNon | null =
    value === 'oui' || value === true  ? 'oui' :
    value === 'non' || value === false ? 'non' :
    null;

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {(['oui', 'non'] as OuiNon[]).map(v => {
        const isActive = normalized === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              padding: '6px 16px',
              borderRadius: '12px',
              border: '1.5px solid',
              borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
              background: isActive ? '#2BBFBF' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#374151',
              fontWeight: isActive ? '600' : '400',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {v === 'oui' ? 'Oui' : 'Non'}
          </button>
        );
      })}
    </div>
  );
}

function ChoixMultiple({
  label,
  options,
  value,
  onChange,
  avecChampLibre,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  avecChampLibre?: boolean;
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
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-3">
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
            {predefined.includes(opt) && (
              <span className="text-white/80 text-xs leading-none">✕</span>
            )}
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
                placeholder="Activité personnalisée..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary"
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

// ─── Rendu d'une question ─────────────────────────────────────────────────────

function RenduInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
}) {
  const fieldCls =
    'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

  const lbl = (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {question.label}
      {question.obligatoire && <span className="text-red-400 ml-1">*</span>}
    </label>
  );

  switch (question.type) {
    case 'text':
    case 'tel':
    case 'email':
      return (
        <div>
          {lbl}
          <input
            type={question.type}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={question.placeholder}
            className={fieldCls}
          />
        </div>
      );

    case 'date':
    case 'time':
      return (
        <div>
          {lbl}
          <input
            type={question.type}
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            className={fieldCls}
          />
        </div>
      );

    case 'number':
      return (
        <div>
          {lbl}
          <input
            type="number"
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            placeholder={question.placeholder ?? '—'}
            className="w-36 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
        </div>
      );

    case 'textarea':
      return (
        <div>
          {lbl}
          <textarea
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={question.placeholder}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
          />
        </div>
      );

    case 'oui-non':
      return (
        <div>
          {lbl}
          <BoutonOuiNon value={value ?? null} onChange={onChange} />
        </div>
      );

    case 'echelle-5':
      return (
        <div>
          {lbl}
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                style={value === n ? { backgroundColor: SCALE5_COLORS[n - 1], color: 'white' } : undefined}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                  value === n ? 'shadow-md scale-105' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );

    case 'echelle-10': {
      const v = value ?? null;
      const getColor = (n: number) =>
        n === 0 ? '#3B6D11' : n <= 3 ? '#F59E0B' : n <= 6 ? '#EF8C00' : n <= 8 ? '#EF4444' : '#991B1B';
      const getLibelle = (n: number) =>
        n === 0 ? '😊 Aucune' : n <= 2 ? '🙂 Légère' : n <= 4 ? '😐 Modérée'
        : n <= 6 ? '😟 Importante' : n <= 8 ? '😣 Sévère' : '😭 Insupportable';
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{question.label}</label>
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

    case 'choix-unique':
      return (
        <div>
          {lbl}
          <div className="flex flex-wrap gap-2">
            {(question.options ?? []).map(opt => (
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
                {value === opt && (
                  <span className="text-white/80 text-xs leading-none">✕</span>
                )}
              </button>
            ))}
          </div>
        </div>
      );

    case 'choix-multiple':
      return (
        <ChoixMultiple
          label={question.label}
          options={question.options ?? []}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          avecChampLibre={question.avecChampLibre}
        />
      );

    case 'operations-list':
      return (
        <div>
          {lbl}
          <ListeOperations
            value={Array.isArray(value) ? value : []}
            onChange={onChange}
          />
        </div>
      );

    default:
      return null;
  }
}

function RenduQuestion({
  question,
  value,
  data,
  onChange,
}: {
  question: Question;
  value: any;
  data: Record<string, any>;
  onChange: (v: any) => void;
}) {
  // Masquer si condition interne non remplie
  if (question.conditionnelSi) {
    const [field, valeur] = question.conditionnelSi.split('_');
    if (data[field] !== valeur) return null;
  }

  const showAlerte =
    !!(question.alerteSi && value && question.alerteSi.includes(value as string));

  return (
    <div>
      <RenduInput question={question} value={value} onChange={onChange} />
      {question.aide && (
        <p className="text-xs text-gray-400 italic mt-1.5">{question.aide}</p>
      )}
      {showAlerte && question.alerteMessage && (
        <div className="mt-2 bg-red-light border border-red-200 rounded-xl px-3 py-2.5 flex gap-2.5 items-start">
          <span className="flex-shrink-0 text-base">⚠️</span>
          <div>
            <div className="text-xs font-bold text-red-700">Chute très récente signalée</div>
            <div className="text-xs text-red-600 mt-0.5">{question.alerteMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlocQuestions({
  bloc,
  data,
  onChange,
  gateValue,
  onGateChange,
}: {
  bloc: BlocConditionnel;
  data: Record<string, any>;
  onChange: (field: string, value: any) => void;
  gateValue?: OuiNon | null;
  onGateChange?: (v: OuiNon) => void;
}) {
  const showContent = !bloc.questionCle || gateValue === 'oui';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">{bloc.titre}</h3>
      </div>
      <div className="p-5 flex flex-col gap-4">
        {bloc.questionCle && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-sm text-gray-700 flex-1">{bloc.questionCle.label}</span>
            <div className="flex-shrink-0">
              <BoutonOuiNon value={gateValue ?? null} onChange={onGateChange!} />
            </div>
          </div>
        )}
        {showContent && bloc.questions.map(q => (
          <RenduQuestion
            key={q.id}
            question={q}
            value={data[q.id]}
            data={data}
            onChange={v => onChange(q.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

function IndicateurCompletion({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
        <span>Complétion du bilan</span>
        <span>
          {pct}% — {filled} / {total} champs remplis
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          style={{
            width: `${pct}%`,
            backgroundColor: pct >= 70 ? 'var(--color-teal)' : '#1A5F9E',
            transition: 'width 0.3s',
          }}
          className="h-full rounded-full"
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Tous les champs sont facultatifs — remplissez ce qui est pertinent.
      </p>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  participantId: string;
  onFlat: (flat: FormulaireFlat) => void;
  initialFlat?: FormulaireFlat;
}

const CLÉS_INITIALES: Record<string, OuiNon | null> = {
  aOperationRecente:    null,
  aBlessure:            null,
};

const TYPES_SIMPLES: QuestionType[] = [
  'text', 'tel', 'email', 'date', 'time', 'number', 'textarea',
  'oui-non', 'echelle-5', 'echelle-10', 'choix-unique', 'choix-multiple',
];

export default function FormulaireBilanInitial({ participantId, onFlat, initialFlat }: Props) {
  const [reponsesClés, setReponsesClés] = useState<Record<string, OuiNon | null>>(
    initialFlat?.reponsesClés ?? CLÉS_INITIALES
  );
  const [data, setData] = useState<Record<string, any>>(initialFlat?.data ?? {});
  const [restored, setRestored] = useState(false);

  // Restaurer depuis localStorage (< 24h)
  useEffect(() => {
    if (initialFlat || restored) return;
    try {
      const saved = localStorage.getItem(getBilanEnCoursKey(participantId));
      if (saved) {
        const parsed = JSON.parse(saved) as {
          data: Record<string, any>;
          reponsesClés: Record<string, OuiNon | null>;
          timestamp: number;
        };
        if (Date.now() - parsed.timestamp < 86_400_000) {
          setData(parsed.data);
          setReponsesClés({ ...CLÉS_INITIALES, ...parsed.reponsesClés });
        }
      }
    } catch {
      // ignore
    }
    setRestored(true);
  }, [participantId, initialFlat, restored]);

  const notify = useCallback(
    (d: Record<string, any>, r: Record<string, OuiNon | null>) => {
      try {
        localStorage.setItem(
          getBilanEnCoursKey(participantId),
          JSON.stringify({ data: d, reponsesClés: r, timestamp: Date.now() })
        );
      } catch {
        // quota exceeded
      }
      onFlat({ data: d, reponsesClés: r });
    },
    [participantId, onFlat]
  );

  useEffect(() => {
    notify(data, reponsesClés);
  }, [data, reponsesClés, notify]);

  function setClé(field: string, value: OuiNon) {
    setReponsesClés(prev => ({ ...prev, [field]: prev[field] === value ? null : value }));
  }

  function setField(field: string, value: any) {
    setData(prev => ({ ...prev, [field]: value }));
  }

  // Complétion : inclut les blocs conditionnels dont le gate est "oui"
  const questionsVisibles = BLOCS.flatMap(b => {
    const gateOk = !b.questionCle || reponsesClés[b.questionCle.field] === 'oui';
    if (!gateOk) return [];
    return b.questions.filter(q => {
      if (!TYPES_SIMPLES.includes(q.type)) return false;
      if (!q.conditionnelSi) return true;
      const [field, valeur] = q.conditionnelSi.split('_');
      return data[field] === valeur;
    });
  });
  const filled = questionsVisibles.filter(q => {
    const v = data[q.id];
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;

  return (
    <div className="flex flex-col gap-5">
      <IndicateurCompletion filled={filled} total={questionsVisibles.length} />

      {/* Blocs de questions — les blocs conditionnels affichent leur gate inline */}
      {BLOCS.map(bloc => (
        <BlocQuestions
          key={bloc.id}
          bloc={bloc}
          data={data}
          onChange={setField}
          gateValue={bloc.questionCle ? reponsesClés[bloc.questionCle.field] : undefined}
          onGateChange={bloc.questionCle ? v => setClé(bloc.questionCle!.field, v) : undefined}
        />
      ))}
    </div>
  );
}
