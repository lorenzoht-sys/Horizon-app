import { useState } from 'react';
import type { Bilan, TestKey, ProfilHandicap } from '../../../types';
import DeltaIndicator from '../DeltaIndicator';
import { useBilanDelta } from '../../../hooks/useBilanDelta';
import { TEST_LABELS } from '../../../data/profiles';
import { Plus } from 'lucide-react';
import ChronoWidget from '../ChronoWidget';


// ─── Souplesse +/- ──────────────────────────────────────────────

function SouplesseInput({
  valeur,
  onChange,
}: {
  valeur: number | null;
  onChange: (v: number | null) => void;
}) {
  const initSigne = valeur === null ? 1 : valeur > 0 ? 1 : valeur < 0 ? -1 : 0;
  const [signe, setSigne] = useState<-1 | 0 | 1>(initSigne as -1 | 0 | 1);
  const absVal = valeur !== null ? Math.abs(valeur) : null;

  function handleSigne(s: -1 | 0 | 1) {
    setSigne(s);
    if (s === 0) onChange(0);
    else if (absVal !== null) onChange(s * absVal);
  }

  function handleAbs(a: number | null) {
    if (a === null) { onChange(null); return; }
    onChange(signe === 0 ? 0 : signe * a);
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {([
          [1,  '+ (dépasse)',     'bg-green-700 border-green-700'],
          [0,  '0 (touche)',      'bg-primary border-primary'],
          [-1, '− (n\'atteint pas)', 'bg-red-500 border-red-500'],
        ] as const).map(([s, label, activeClass]) => (
          <button key={s} type="button"
            onClick={() => handleSigne(s as -1 | 0 | 1)}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
              signe === s
                ? `${activeClass} text-white`
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {signe !== 0 && (
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number" min={0} max={40}
            value={absVal ?? ''}
            onChange={e => handleAbs(e.target.value === '' ? null : Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            placeholder="0"
          />
          <span className="text-xs text-gray-400">cm</span>
          {valeur !== null && (
            <span className={`text-sm font-bold ml-1 ${valeur > 0 ? 'text-green-700' : valeur < 0 ? 'text-red-500' : 'text-primary'}`}>
              {valeur > 0 ? `+${valeur}` : valeur} cm
            </span>
          )}
        </div>
      )}

      <div className="p-2.5 bg-blue-50 rounded-lg text-xs text-gray-500 leading-relaxed">
        <strong>+</strong> Dépasse les pieds (doigts en dessous du niveau des pieds)<br />
        <strong>0</strong> Touche exactement les pieds<br />
        <strong>−</strong> N'atteint pas les pieds (valeur = distance restante)
      </div>
    </div>
  );
}

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  previous: Bilan | null;
  testsActifs?: TestKey[];
  profilHandicap?: ProfilHandicap;
}

function Num({ label, value, onChange, unit, min, max, step = 0.1 }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  unit?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" value={value ?? ''} min={min} max={max} step={step}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          placeholder="—" />
        {unit && <span className="text-xs text-gray-400 w-8">{unit}</span>}
      </div>
    </div>
  );
}

const PHYSICAL_TESTS: TestKey[] = ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'apley'];

// ─── Apley's Scratch Test ───────────────────────────────────────────

const SCORE_HAUT: Record<string, number> = { shoulder: 4, neck: 3, top: 2, below: 1 };
const SCORE_BAS:  Record<string, number> = { scapula: 4, mid_back: 3, low_back: 2, buttocks: 1 };

const HAUT_OPTS = [
  { key: 'shoulder', label: "Touche l'épaule opposée",       sub: 'normal' },
  { key: 'neck',     label: 'Atteint la nuque',               sub: 'légèrement limité' },
  { key: 'top',      label: 'Atteint le sommet de la tête',   sub: 'modérément limité' },
  { key: 'below',    label: 'Ne dépasse pas le sommet',       sub: 'très limité' },
];

const BAS_OPTS = [
  { key: 'scapula',  label: "Atteint l'omoplate opposée",     sub: 'normal' },
  { key: 'mid_back', label: 'Atteint le milieu du dos',       sub: 'légèrement limité' },
  { key: 'low_back', label: 'Atteint le bas du dos',          sub: 'modérément limité' },
  { key: 'buttocks', label: 'Atteint seulement les fesses',   sub: 'très limité' },
];

function apleyBadge(score: number | null) {
  if (score === null) return null;
  if (score >= 3.5) return { emoji: '🟢', label: 'Amplitude normale',              bg: '#D1FAE5', color: '#065F46' };
  if (score >= 2.5) return { emoji: '🟡', label: 'Légèrement limité',              bg: '#FEF3C7', color: '#92400E' };
  if (score >= 1.5) return { emoji: '🟠', label: 'Modérément limité',              bg: '#FED7AA', color: '#9A3412' };
  return              { emoji: '🔴', label: 'Très limité — à signaler au médecin', bg: '#FEE2E2', color: '#991B1B' };
}

type ApleyVal = NonNullable<BilanForm['apley']>;

function ApleyTest({ value, onChange }: {
  value: ApleyVal | undefined;
  onChange: (v: ApleyVal) => void;
}) {
  const v: ApleyVal = value ?? { haut_d: null, haut_g: null, bas_d: null, bas_g: null, score: null, notes: '' };

  function update(patch: Partial<ApleyVal>) {
    const next = { ...v, ...patch };
    const scores = [
      next.haut_d ? SCORE_HAUT[next.haut_d] : null,
      next.haut_g ? SCORE_HAUT[next.haut_g] : null,
      next.bas_d  ? SCORE_BAS[next.bas_d]   : null,
      next.bas_g  ? SCORE_BAS[next.bas_g]   : null,
    ].filter((s): s is number => s !== null);
    next.score = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
      : null;
    onChange(next);
  }

  const badge = apleyBadge(v.score);
  const sh = v.haut_d ? SCORE_HAUT[v.haut_d] : null;
  const gh = v.haut_g ? SCORE_HAUT[v.haut_g] : null;
  const sb = v.bas_d  ? SCORE_BAS[v.bas_d]   : null;
  const gb = v.bas_g  ? SCORE_BAS[v.bas_g]   : null;
  const asym = (sh !== null && gh !== null && Math.abs(sh - gh) > 1)
            || (sb !== null && gb !== null && Math.abs(sb - gb) > 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">🤲 Apley's Scratch Test</h3>
        {badge && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: badge.bg, color: badge.color }}>
            {badge.emoji} {badge.label} — {v.score}/4
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4">Amplitude épaule &amp; dyskinésie scapulaire</p>

      {/* Mouvement Haut */}
      <div className="p-3 bg-gray-50 rounded-xl mb-3 border border-gray-100">
        <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">Mouvement haut — abduction + rotation externe</p>
        <p className="text-[11px] text-gray-400 italic mb-3">"Passez la main derrière la tête vers l'épaule opposée"</p>
        <div className="grid grid-cols-2 gap-4">
          {(['haut_d', 'haut_g'] as const).map(side => (
            <div key={side}>
              <p className="text-xs font-semibold text-gray-600 mb-2">Côté {side === 'haut_d' ? 'Droit' : 'Gauche'}</p>
              {HAUT_OPTS.map(opt => (
                <label key={opt.key} className="flex items-start gap-2 mb-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`apley-${side}`}
                    value={opt.key}
                    checked={v[side] === opt.key}
                    onChange={() => update({ [side]: opt.key })}
                    className="mt-0.5 flex-shrink-0"
                    style={{ accentColor: 'var(--color-teal)' }}
                  />
                  <span className="text-xs text-gray-700 leading-tight">
                    {opt.label}
                    <span className="text-gray-400 ml-1">({opt.sub})</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Mouvement Bas */}
      <div className="p-3 bg-gray-50 rounded-xl mb-3 border border-gray-100">
        <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">Mouvement bas — adduction + rotation interne</p>
        <p className="text-[11px] text-gray-400 italic mb-3">"Passez la main dans le dos vers l'épaule opposée"</p>
        <div className="grid grid-cols-2 gap-4">
          {(['bas_d', 'bas_g'] as const).map(side => (
            <div key={side}>
              <p className="text-xs font-semibold text-gray-600 mb-2">Côté {side === 'bas_d' ? 'Droit' : 'Gauche'}</p>
              {BAS_OPTS.map(opt => (
                <label key={opt.key} className="flex items-start gap-2 mb-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`apley-${side}`}
                    value={opt.key}
                    checked={v[side] === opt.key}
                    onChange={() => update({ [side]: opt.key })}
                    className="mt-0.5 flex-shrink-0"
                    style={{ accentColor: 'var(--color-teal)' }}
                  />
                  <span className="text-xs text-gray-700 leading-tight">
                    {opt.label}
                    <span className="text-gray-400 ml-1">({opt.sub})</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Asymétrie */}
      {asym && (
        <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg mb-3 text-xs font-semibold text-yellow-800">
          ⚠️ Asymétrie D/G à surveiller
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes cliniques</label>
        <textarea
          value={v.notes}
          onChange={e => update({ notes: e.target.value })}
          placeholder="Douleur signalée ? Compensation observée ?..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary resize-none"
        />
      </div>
    </div>
  );
}

export default function Step2_Physical({ form, update, previous, testsActifs }: Props) {
  const d = useBilanDelta(form as Bilan, previous);
  const [extras, setExtras] = useState<TestKey[]>([]);

  const active = testsActifs
    ? [...new Set([...testsActifs.filter(k => PHYSICAL_TESTS.includes(k)), ...extras])]
    : PHYSICAL_TESTS;

  const addable = PHYSICAL_TESTS.filter(k => !active.includes(k));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-heading font-semibold text-dark">Tests physiques</h2>

      {/* Équilibre */}
      {active.includes('equilibre') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Équilibre unipodal (s)</h3>
            <div className="flex gap-3">
              <DeltaIndicator delta={d.equilibreDroite} unit="s" />
              <DeltaIndicator delta={d.equilibreGauche} unit="s" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">Jambe droite</p>
              <ChronoWidget
                mode="up-MMSScc"
                onStop={s => update({ equilibre: { ...form.equilibre, droite: parseFloat(s.toFixed(2)) } })}
              />
              <Num label="Durée" value={form.equilibre.droite} unit="s" min={0} max={60} step={0.01}
                onChange={v => update({ equilibre: { ...form.equilibre, droite: v } })} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">Jambe gauche</p>
              <ChronoWidget
                mode="up-MMSScc"
                onStop={s => update({ equilibre: { ...form.equilibre, gauche: parseFloat(s.toFixed(2)) } })}
              />
              <Num label="Durée" value={form.equilibre.gauche} unit="s" min={0} max={60} step={0.01}
                onChange={v => update({ equilibre: { ...form.equilibre, gauche: v } })} />
            </div>
          </div>
        </section>
      )}

      {/* Chair Stand */}
      {active.includes('chairStand') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Chair Stand 30s</h3>
            <DeltaIndicator delta={d.chairStand30} unit="rép." />
          </div>
          <Num label="Nombre de répétitions" value={form.chairStand30} unit="rép." min={0} max={40} step={1}
            onChange={v => update({ chairStand30: v })} />
        </section>
      )}

      {/* HandGrip */}
      {active.includes('handGrip') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">HandGrip (kg)</h3>
            <div className="flex gap-3">
              <DeltaIndicator delta={d.handGripDroite} unit="kg" />
              <DeltaIndicator delta={d.handGripGauche} unit="kg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Num label="Main droite" value={form.handGrip.droite} unit="kg" min={0} max={80}
              onChange={v => update({ handGrip: { ...form.handGrip, droite: v } })} />
            <Num label="Main gauche" value={form.handGrip.gauche} unit="kg" min={0} max={80}
              onChange={v => update({ handGrip: { ...form.handGrip, gauche: v } })} />
          </div>
        </section>
      )}

      {/* TUG */}
      {active.includes('tug') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">TUG 3m (s)</h3>
            <DeltaIndicator delta={d.tug3m} unit="s" />
          </div>
          <div className="space-y-2">
            <ChronoWidget
              mode="up-MMSScc"
              onStop={s => update({ tug3m: parseFloat(s.toFixed(2)) })}
            />
            <Num label="Temps (moins = mieux)" value={form.tug3m} unit="s" min={0} max={60} step={0.01}
              onChange={v => update({ tug3m: v })} />
          </div>
        </section>
      )}

      {/* Souplesse */}
      {active.includes('souplesse') && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Souplesse — Flexion avant</h3>
            <DeltaIndicator delta={d.souplesse} unit="cm" />
          </div>
          <div className="flex gap-2 mb-3">
            {(['assis', 'debout'] as const).map(m => (
              <button key={m} type="button"
                onClick={() => update({ souplesse: { ...form.souplesse, methode: m } })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.souplesse.methode === m ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'
                }`}>
                {m === 'assis' ? 'Assis' : 'Debout'}
              </button>
            ))}
          </div>
          <SouplesseInput
            valeur={form.souplesse.valeur}
            onChange={v => update({ souplesse: { ...form.souplesse, valeur: v } })}
          />
        </section>
      )}

      {/* Apley's Scratch Test */}
      {active.includes('apley') && (
        <section>
          <ApleyTest
            value={form.apley}
            onChange={v => update({ apley: v })}
          />
        </section>
      )}

      {/* Bouton ajouter un test ponctuel */}
      {addable.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 self-center">Ajouter un test :</span>
          {addable.map(k => (
            <button key={k} type="button"
              onClick={() => setExtras(prev => [...prev, k])}
              className="flex items-center gap-1 text-xs text-primary border border-primary/30 hover:bg-primary/5 px-2.5 py-1 rounded-lg transition-colors">
              <Plus size={11} />{TEST_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
