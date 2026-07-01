import { useState, useEffect } from 'react';
import type { Bilan, TestKey, ProfilHandicap } from '../../../types';
import DeltaIndicator from '../DeltaIndicator';
import { useBilanDelta } from '../../../hooks/useBilanDelta';
import { TEST_LABELS } from '../../../data/profiles';
import { Plus } from 'lucide-react';
import ChronoWidget from '../ChronoWidget';
import TinettiTest from '../TinettiTest';
import BergTest from '../BergTest';
import AdlTest from '../AdlTest';
import { computeBergScore } from '../../../data/berg';
import { computeTinettiScores } from '../../../data/tinetti';

// ── Badge résultat unifié ─────────────────────────────────────────────────────
type BadgeCouleur = 'vert' | 'orange' | 'rouge';
interface BadgeInfo { couleur: BadgeCouleur; label: string }

function BadgeResultat({ couleur, label }: BadgeInfo) {
  const styles: Record<BadgeCouleur, string> = {
    vert:   'bg-green-50 text-green-700 border-green-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    rouge:  'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span role="status" aria-label={label}
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${styles[couleur]}`}>
      {label}
    </span>
  );
}

// ── En-tête de card unifié ────────────────────────────────────────────────────
function CardHeader({ title, subtitle, badge, children }: {
  title: string; subtitle: string; badge?: BadgeInfo | null; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium text-dark">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {badge && <BadgeResultat {...badge} />}
        {children}
      </div>
    </div>
  );
}

// ─── Souplesse +/- ───────────────────────────────────────────────────────────
function SouplesseInput({ valeur, onChange }: { valeur: number | null; onChange: (v: number | null) => void }) {
  const initSigne = valeur === null ? 1 : valeur > 0 ? 1 : valeur < 0 ? -1 : 0;
  const [signe, setSigne] = useState<-1 | 0 | 1>(initSigne as -1 | 0 | 1);
  const absVal = valeur !== null ? Math.abs(valeur) : null;

  useEffect(() => {
    if (valeur === null) return;
    const expected: -1 | 0 | 1 = valeur > 0 ? 1 : valeur < 0 ? -1 : 0;
    setSigne(expected);
  }, [valeur]);

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
      <div role="group" aria-label="Sens de la souplesse" className="flex gap-2 mb-3">
        {([
          [1,  '+ (dépasse)',        'bg-green-700 border-green-700'],
          [0,  '0 (touche)',         'bg-primary border-primary'],
          [-1, '− (n\'atteint pas)', 'bg-danger border-red-500'],
        ] as const).map(([s, label, activeClass]) => (
          <button key={s} type="button" aria-pressed={signe === s}
            onClick={() => handleSigne(s as -1 | 0 | 1)}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              signe === s ? `${activeClass} text-white` : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {signe !== 0 && (
        <div className="flex items-center gap-2 mb-2">
          <input id="souplesse-valeur" type="number" min={0} max={40}
            value={absVal ?? ''}
            onChange={e => handleAbs(e.target.value === '' ? null : Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            placeholder="0" />
          <span className="text-xs text-gray-400">cm</span>
          {valeur !== null && (
            <span className={`text-sm font-bold ml-1 ${valeur > 0 ? 'text-green-700' : valeur < 0 ? 'text-red-500' : 'text-primary'}`}>
              {valeur > 0 ? `+${valeur}` : valeur} cm
            </span>
          )}
        </div>
      )}
      <div className="p-2.5 bg-blue-50 rounded-lg text-xs text-gray-500 leading-relaxed">
        <strong>+</strong> Dépasse les pieds · <strong>0</strong> Touche les pieds · <strong>−</strong> N'atteint pas les pieds
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

function Num({ label, id, value, onChange, unit, min, max, step = 0.1 }: {
  label: string; id: string; value: number | null; onChange: (v: number | null) => void;
  unit?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" value={value ?? ''} min={min} max={max} step={step}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          placeholder="—" />
        {unit && <span className="text-xs text-gray-400 w-8">{unit}</span>}
      </div>
    </div>
  );
}

const PHYSICAL_TESTS: TestKey[] = ['equilibre', 'chairStand', 'handGrip', 'tug', 'souplesse', 'apley', 'tinetti', 'eva', 'berg', 'marche10m', 'adl'];

// ─── Apley's Scratch Test (corps uniquement — header géré en externe) ─────────
const SCORE_HAUT: Record<string, number> = { shoulder: 4, neck: 3, top: 2, below: 1 };
const SCORE_BAS:  Record<string, number> = { scapula: 4, mid_back: 3, low_back: 2, buttocks: 1 };

const HAUT_OPTS = [
  { key: 'shoulder', label: "Touche l'épaule opposée",     sub: 'normal' },
  { key: 'neck',     label: 'Atteint la nuque',             sub: 'légèrement limité' },
  { key: 'top',      label: 'Atteint le sommet de la tête', sub: 'modérément limité' },
  { key: 'below',    label: 'Ne dépasse pas le sommet',     sub: 'très limité' },
];
const BAS_OPTS = [
  { key: 'scapula',  label: "Atteint l'omoplate opposée",  sub: 'normal' },
  { key: 'mid_back', label: 'Atteint le milieu du dos',    sub: 'légèrement limité' },
  { key: 'low_back', label: 'Atteint le bas du dos',       sub: 'modérément limité' },
  { key: 'buttocks', label: 'Atteint seulement les fesses', sub: 'très limité' },
];

type ApleyVal = NonNullable<BilanForm['apley']>;

function ApleyTest({ value, onChange }: { value: ApleyVal | undefined; onChange: (v: ApleyVal) => void }) {
  const v: ApleyVal = value ?? { haut_d: null, haut_g: null, bas_d: null, bas_g: null, score: null, notes: '' };

  function upd(patch: Partial<ApleyVal>) {
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

  const sh = v.haut_d ? SCORE_HAUT[v.haut_d] : null;
  const gh = v.haut_g ? SCORE_HAUT[v.haut_g] : null;
  const sb = v.bas_d  ? SCORE_BAS[v.bas_d]   : null;
  const gb = v.bas_g  ? SCORE_BAS[v.bas_g]   : null;
  const asym = (sh !== null && gh !== null && Math.abs(sh - gh) > 1)
            || (sb !== null && gb !== null && Math.abs(sb - gb) > 1);

  function RadioGroup({ side, opts }: {
    side: 'haut_d' | 'haut_g' | 'bas_d' | 'bas_g';
    opts: typeof HAUT_OPTS;
  }) {
    const labelId = `apley-${side}-label`;
    const sideLabel = side.endsWith('d') ? 'Droit' : 'Gauche';
    return (
      <div>
        <p id={labelId} className="text-xs font-semibold text-gray-600 mb-2">Côté {sideLabel}</p>
        <div role="group" aria-labelledby={labelId}>
          {opts.map(opt => (
            <label key={opt.key} className="flex items-start gap-2 mb-2 cursor-pointer">
              <input type="radio" name={`apley-${side}`} value={opt.key}
                checked={v[side] === opt.key}
                onChange={() => upd({ [side]: opt.key })}
                className="mt-0.5 flex-shrink-0"
                style={{ accentColor: 'var(--color-teal)' }} />
              <span className="text-xs text-gray-700 leading-tight">
                {opt.label}<span className="text-gray-400 ml-1">({opt.sub})</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="p-3 bg-gray-50 rounded-xl mb-3 border border-gray-100">
        <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">Mouvement haut — abduction + rotation externe</p>
        <p className="text-[11px] text-gray-400 italic mb-3">"Passez la main derrière la tête vers l'épaule opposée"</p>
        <div className="grid grid-cols-2 gap-4">
          <RadioGroup side="haut_d" opts={HAUT_OPTS} />
          <RadioGroup side="haut_g" opts={HAUT_OPTS} />
        </div>
      </div>
      <div className="p-3 bg-gray-50 rounded-xl mb-3 border border-gray-100">
        <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1">Mouvement bas — adduction + rotation interne</p>
        <p className="text-[11px] text-gray-400 italic mb-3">"Passez la main dans le dos vers l'épaule opposée"</p>
        <div className="grid grid-cols-2 gap-4">
          <RadioGroup side="bas_d" opts={BAS_OPTS} />
          <RadioGroup side="bas_g" opts={BAS_OPTS} />
        </div>
      </div>
      {asym && (
        <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg mb-3 text-xs font-semibold text-yellow-800">
          ⚠️ Asymétrie D/G à surveiller
        </div>
      )}
      <div>
        <label htmlFor="apley-notes" className="block text-xs text-gray-500 mb-1">Notes cliniques</label>
        <textarea id="apley-notes" value={v.notes}
          onChange={e => upd({ notes: e.target.value })}
          placeholder="Douleur signalée ? Compensation observée ?..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none" />
      </div>
    </div>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
function b(val: number | null, pairs: [number, string, BadgeCouleur][]): BadgeInfo | null {
  if (val === null) return null;
  for (const [threshold, label, couleur] of pairs) {
    if (val >= threshold) return { couleur, label };
  }
  return null;
}
function bInv(val: number | null, pairs: [number, string, BadgeCouleur][]): BadgeInfo | null {
  if (val === null) return null;
  for (const [threshold, label, couleur] of pairs) {
    if (val <= threshold) return { couleur, label };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Step2_Physical({ form, update, previous, testsActifs }: Props) {
  const d = useBilanDelta(form as Bilan, previous);
  const [extras, setExtras] = useState<TestKey[]>([]);

  const active = testsActifs
    ? [...new Set([...testsActifs.filter(k => PHYSICAL_TESTS.includes(k)), ...extras])]
    : PHYSICAL_TESTS;

  const addable = PHYSICAL_TESTS.filter(k => !active.includes(k));

  // Calcul des badges
  const equBest = Math.max(form.equilibre.droite ?? 0, form.equilibre.gauche ?? 0);
  const badgeEquilibre = (form.equilibre.droite !== null || form.equilibre.gauche !== null)
    ? b(equBest, [[20, 'Bon équilibre', 'vert'], [10, 'Équilibre réduit', 'orange'], [0, 'Risque de chute', 'rouge']]) : null;

  const badgeChairStand = b(form.chairStand30,
    [[15, 'Force normale', 'vert'], [11, 'Force réduite', 'orange'], [0, 'Force insuffisante', 'rouge']]);

  const gripBest = Math.max(form.handGrip.droite ?? 0, form.handGrip.gauche ?? 0);
  const badgeHandGrip = (form.handGrip.droite !== null || form.handGrip.gauche !== null)
    ? b(gripBest, [[25, 'Force normale', 'vert'], [20, 'Force réduite', 'orange'], [0, 'Sarcopénie probable', 'rouge']]) : null;

  const badgeTug = bInv(form.tug3m,
    [[10, 'Mobilité normale', 'vert'], [14, 'Risque modéré', 'orange'], [999, 'Risque élevé', 'rouge']]);

  const badgeSouplesse = b(form.souplesse.valeur,
    [[0, 'Bonne souplesse', 'vert'], [-10, 'Souplesse réduite', 'orange'], [-100, 'Très réduite', 'rouge']]);

  const badgeApley = b(form.apley?.score ?? null,
    [[3.5, 'Amplitude normale', 'vert'], [2.5, 'Légèrement limité', 'orange'], [0, 'Très limité', 'rouge']]);

  const tinettiScores = computeTinettiScores(form.tinetti);
  const badgeTinetti = tinettiScores?.complet
    ? b(tinettiScores.scoreTotal, [[24, 'Risque faible', 'vert'], [19, 'Risque modéré', 'orange'], [0, 'Risque élevé', 'rouge']]) : null;

  const badgeEva = (form.douleurEva !== null && form.douleurEva !== undefined)
    ? bInv(form.douleurEva, [[3, 'Douleur faible', 'vert'], [6, 'Douleur modérée', 'orange'], [10, 'Douleur forte', 'rouge']]) : null;

  const bergScore = computeBergScore(form.berg);
  const badgeBerg = b(bergScore,
    [[49, 'Risque faible', 'vert'], [45, 'Risque modéré', 'orange'], [0, 'Risque élevé', 'rouge']]);

  const marche10mVitesse = (form.marche10m?.habituel && form.marche10m.habituel > 0)
    ? 10 / form.marche10m.habituel : null;
  const badgeMarche10m = b(marche10mVitesse,
    [[1.0, 'Vitesse normale', 'vert'], [0.8, 'Vitesse limite', 'orange'], [0, 'Risque de chute', 'rouge']]);

  const adlTotal = form.adl || form.iadl
    ? (form.adl ? Object.values(form.adl).filter(Boolean).length : 0)
      + (form.iadl ? Object.values(form.iadl).filter(Boolean).length : 0)
    : null;
  const badgeAdl = b(adlTotal,
    [[12, 'Autonomie préservée', 'vert'], [8, 'Dépendance partielle', 'orange'], [0, 'Dépendance importante', 'rouge']]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-dark">Tests physiques</h2>

      {/* Équilibre unipodal */}
      {active.includes('equilibre') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Équilibre unipodal" subtitle="Appui unipodal, yeux ouverts — équilibre statique" badge={badgeEquilibre}>
            <DeltaIndicator delta={d.equilibreDroite} unit="s" />
            <DeltaIndicator delta={d.equilibreGauche} unit="s" />
          </CardHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Jambe droite</p>
              <ChronoWidget mode="up-MMSScc"
                onStop={s => update({ equilibre: { ...form.equilibre, droite: parseFloat(s.toFixed(2)) } })} />
              <Num id="equilibre-droite" label="Durée" value={form.equilibre.droite} unit="s" min={0} max={60} step={0.01}
                onChange={v => update({ equilibre: { ...form.equilibre, droite: v } })} />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Jambe gauche</p>
              <ChronoWidget mode="up-MMSScc"
                onStop={s => update({ equilibre: { ...form.equilibre, gauche: parseFloat(s.toFixed(2)) } })} />
              <Num id="equilibre-gauche" label="Durée" value={form.equilibre.gauche} unit="s" min={0} max={60} step={0.01}
                onChange={v => update({ equilibre: { ...form.equilibre, gauche: v } })} />
            </div>
          </div>
        </section>
      )}

      {/* Chair Stand 30s */}
      {active.includes('chairStand') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Chair Stand 30s" subtitle="Levers de chaise répétés — force des membres inférieurs" badge={badgeChairStand}>
            <DeltaIndicator delta={d.chairStand30} unit="rép." />
          </CardHeader>
          <Num id="chair-stand" label="Nombre de répétitions" value={form.chairStand30} unit="rép." min={0} max={40} step={1}
            onChange={v => update({ chairStand30: v })} />
        </section>
      )}

      {/* Hand Grip */}
      {active.includes('handGrip') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Hand Grip" subtitle="Force de préhension au dynamomètre — marqueur sarcopénie (EWGSOP2)" badge={badgeHandGrip}>
            <DeltaIndicator delta={d.handGripDroite} unit="kg" />
            <DeltaIndicator delta={d.handGripGauche} unit="kg" />
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            <Num id="handgrip-droite" label="Main droite" value={form.handGrip.droite} unit="kg" min={0} max={80}
              onChange={v => update({ handGrip: { ...form.handGrip, droite: v } })} />
            <Num id="handgrip-gauche" label="Main gauche" value={form.handGrip.gauche} unit="kg" min={0} max={80}
              onChange={v => update({ handGrip: { ...form.handGrip, gauche: v } })} />
          </div>
        </section>
      )}

      {/* TUG 3m */}
      {active.includes('tug') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="TUG 3m" subtitle="Timed Up &amp; Go — mobilité fonctionnelle et risque de chute (HAS)" badge={badgeTug}>
            <DeltaIndicator delta={d.tug3m} unit="s" />
          </CardHeader>
          <div className="space-y-2">
            <ChronoWidget mode="up-MMSScc" onStop={s => update({ tug3m: parseFloat(s.toFixed(2)) })} />
            <Num id="tug-temps" label="Temps (moins = mieux)" value={form.tug3m} unit="s" min={0} max={60} step={0.01}
              onChange={v => update({ tug3m: v })} />
          </div>
        </section>
      )}

      {/* Souplesse */}
      {active.includes('souplesse') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Souplesse — flexion avant" subtitle="Distance doigts-pieds — flexibilité des ischio-jambiers" badge={badgeSouplesse}>
            <DeltaIndicator delta={d.souplesse} unit="cm" />
          </CardHeader>
          <div className="flex gap-2 mb-3" role="group" aria-label="Méthode de mesure">
            {(['assis', 'debout'] as const).map(m => (
              <button key={m} type="button" aria-pressed={form.souplesse.methode === m}
                onClick={() => update({ souplesse: { ...form.souplesse, methode: m } })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  form.souplesse.methode === m ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600'
                }`}>
                {m === 'assis' ? 'Assis' : 'Debout'}
              </button>
            ))}
          </div>
          <SouplesseInput valeur={form.souplesse.valeur}
            onChange={v => update({ souplesse: { ...form.souplesse, valeur: v } })} />
        </section>
      )}

      {/* Apley's Scratch Test */}
      {active.includes('apley') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Apley Scratch Test" subtitle="Amplitude épaule — abduction et rotation (score /4)" badge={badgeApley}>
            <DeltaIndicator delta={d.apleyScore} unit="/4" />
          </CardHeader>
          <ApleyTest value={form.apley} onChange={v => update({ apley: v })} />
        </section>
      )}

      {/* Tinetti (POMA) */}
      {active.includes('tinetti') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Tinetti (POMA)" subtitle="Équilibre et marche gériatrique — score /28 (HAS chutes)" badge={badgeTinetti}>
            <DeltaIndicator delta={d.tinettiScore} unit="pts" />
          </CardHeader>
          <TinettiTest value={form.tinetti} onChange={v => update({ tinetti: v })} hideHeader />
        </section>
      )}

      {/* Douleur EVA */}
      {active.includes('eva') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Douleur ressentie (EVA)" subtitle="Échelle numérique 0-10 — douleur au moment du bilan" badge={badgeEva} />
          <div role="group" aria-label="Intensité de la douleur de 0 à 10" className="flex gap-1 mb-2">
            {Array.from({ length: 11 }, (_, i) => (
              <button key={i} type="button"
                aria-label={`Douleur ${i} sur 10`}
                aria-pressed={form.douleurEva === i}
                onClick={() => update({ douleurEva: i })}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  form.douleurEva === i
                    ? i <= 3 ? 'bg-green-600 text-white' : i <= 6 ? 'bg-yellow-500 text-white' : 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {i}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 px-0.5 mb-2">
            <span>Aucune</span>
            <span>Modérée</span>
            <span>Maximale</span>
          </div>
          {form.douleurEva !== null && form.douleurEva !== undefined && (
            <button type="button" onClick={() => update({ douleurEva: null })}
              className="text-xs text-gray-400 hover:text-gray-600 underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded">
              Effacer
            </button>
          )}
        </section>
      )}

      {/* Berg Balance Scale */}
      {active.includes('berg') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Berg Balance Scale" subtitle="Équilibre fonctionnel — 14 items cotés 0-4, score /56" badge={badgeBerg}>
            <DeltaIndicator delta={d.bergScore} unit="pts" />
          </CardHeader>
          <BergTest value={form.berg} onChange={v => update({ berg: v })} />
        </section>
      )}

      {/* Test de marche 10 mètres */}
      {active.includes('marche10m') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="Test de marche 10 m" subtitle="Vitesse de marche habituelle et maximale — mobilité fonctionnelle" badge={badgeMarche10m}>
            <DeltaIndicator delta={d.marche10mHabituel} unit="s" />
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Vitesse habituelle</p>
              <ChronoWidget mode="up-MMSScc"
                onStop={s => update({ marche10m: { habituel: parseFloat(s.toFixed(2)), max: form.marche10m?.max ?? null } })} />
              <Num id="marche10m-habituel" label="Temps" value={form.marche10m?.habituel ?? null} unit="s" min={0} max={120} step={0.01}
                onChange={v => update({ marche10m: { habituel: v, max: form.marche10m?.max ?? null } })} />
              {form.marche10m?.habituel != null && form.marche10m.habituel > 0 && (
                <p className="text-xs font-semibold text-gray-600">
                  = {(10 / form.marche10m.habituel).toFixed(2)} m/s
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Vitesse maximale</p>
              <ChronoWidget mode="up-MMSScc"
                onStop={s => update({ marche10m: { habituel: form.marche10m?.habituel ?? null, max: parseFloat(s.toFixed(2)) } })} />
              <Num id="marche10m-max" label="Temps" value={form.marche10m?.max ?? null} unit="s" min={0} max={120} step={0.01}
                onChange={v => update({ marche10m: { habituel: form.marche10m?.habituel ?? null, max: v } })} />
              {form.marche10m?.max != null && form.marche10m.max > 0 && (
                <p className="text-xs font-semibold text-gray-600">
                  = {(10 / form.marche10m.max).toFixed(2)} m/s max
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400">Seuil : &lt; 0,8 m/s = risque de chute · &gt; 1,0 m/s = autonomie préservée</p>
        </section>
      )}

      {/* ADL / IADL (Katz) */}
      {active.includes('adl') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader title="ADL / IADL (Katz)" subtitle="Activités de base (6) et instrumentales (8) — autonomie fonctionnelle" badge={badgeAdl}>
            <DeltaIndicator delta={d.adlIadlTotal} unit="pts" />
          </CardHeader>
          <AdlTest adl={form.adl} iadl={form.iadl}
            onAdlChange={v => update({ adl: v })}
            onIadlChange={v => update({ iadl: v })} />
        </section>
      )}

      {/* Bouton ajouter un test ponctuel */}
      {addable.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 self-center">Ajouter un test :</span>
          {addable.map(k => (
            <button key={k} type="button"
              onClick={() => setExtras(prev => [...prev, k])}
              className="flex items-center gap-1 text-xs text-primary border border-primary/30 hover:bg-primary/5 px-2.5 py-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30">
              <Plus size={11} />{TEST_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
