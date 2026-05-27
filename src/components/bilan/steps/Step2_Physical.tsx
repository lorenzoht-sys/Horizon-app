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

const PHYSICAL_TESTS: TestKey[] = ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse'];

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
