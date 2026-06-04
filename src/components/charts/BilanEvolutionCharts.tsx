import type { Bilan } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function bilanLabel(b: Bilan, idx: number, total: number): string {
  if (total === 1) return 'Bilan';
  if (idx === 0) return 'Bilan I';
  if (idx === total - 1 && total > 2) return 'Dernier';
  return `T${b.trimestre || idx + 1}`;
}

// ─── Config tests ─────────────────────────────────────────────────────────────

interface TestCfg {
  key: string;
  label: string;
  unit: string;
  lowerBetter: boolean;
  getValue: (b: Bilan) => number | null | undefined;
  cat: (v: number) => 'g' | 'o' | 'r';
  score: (v: number) => number;
}

const TESTS: TestCfg[] = [
  {
    key: 'tug', label: 'TUG 3m', unit: 's', lowerBetter: true,
    getValue: b => b.tug3m,
    cat: v => v < 12 ? 'g' : v <= 20 ? 'o' : 'r',
    score: v => clamp((30 - v) / 24 * 100),
  },
  {
    key: 'cs', label: 'Chair Stand', unit: 'rép.', lowerBetter: false,
    getValue: b => b.chairStand30,
    cat: v => v >= 10 ? 'g' : v >= 6 ? 'o' : 'r',
    score: v => clamp(v / 15 * 100),
  },
  {
    key: 'grip', label: 'HandGrip D', unit: 'kg', lowerBetter: false,
    getValue: b => b.handGrip.droite,
    cat: v => v >= 16 ? 'g' : v >= 8 ? 'o' : 'r',
    score: v => clamp(v / 25 * 100),
  },
  {
    key: 'equ', label: 'Équilibre', unit: 's', lowerBetter: false,
    getValue: b => b.equilibre.droite ?? b.equilibre.gauche,
    cat: v => v > 10 ? 'g' : v >= 5 ? 'o' : 'r',
    score: v => clamp(v / 30 * 100),
  },
  {
    key: 'soup', label: 'Souplesse', unit: 'cm', lowerBetter: false,
    getValue: b => b.souplesse.valeur,
    cat: v => v > 5 ? 'g' : v >= -5 ? 'o' : 'r',
    score: v => clamp((v + 30) / 50 * 100),
  },
  {
    key: 'tm6', label: 'TM6', unit: 'm', lowerBetter: false,
    getValue: b => b.tm6.distanceMetres,
    cat: v => v >= 400 ? 'g' : v >= 200 ? 'o' : 'r',
    score: v => clamp(v / 600 * 100),
  },
  {
    key: 'borg', label: 'Borg RPE', unit: '', lowerBetter: true,
    getValue: b => b.tm6.borgRPE,
    cat: v => (v >= 9 && v <= 13) ? 'g' : v <= 16 ? 'o' : 'r',
    score: v => clamp(100 - Math.abs(v - 11) * 12),
  },
];

const CAT = {
  g: { bg: '#E1F5EE', text: '#085041' },
  o: { bg: '#FAEEDA', text: '#633806' },
  r: { bg: '#FCEBEB', text: '#791F1F' },
};

function scoreColor(s: number): string {
  return s >= 70 ? '#1D9E75' : s >= 40 ? '#F59E0B' : '#EF4444';
}

function barColor(idx: number, last: number): string {
  if (idx === 0) return '#9FE1CB';
  if (idx === last) return '#0D2B2B';
  return '#1D9E75';
}

function calcGlobalScore(b: Bilan): number {
  const scores = TESTS
    .map(t => { const v = t.getValue(b); return v != null ? t.score(v) : null; })
    .filter((s): s is number => s !== null);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, s) => a + s, 0) / scores.length);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props { bilans: Bilan[] }

// ─── 1. Score global ──────────────────────────────────────────────────────────

function ScoreGlobal({ bilans }: Props) {
  const scores = bilans.map(calcGlobalScore);
  const totalDelta = scores[scores.length - 1] - scores[0];
  const mois = Math.round(
    (new Date(bilans[bilans.length - 1].date).getTime() - new Date(bilans[0].date).getTime())
    / (1000 * 60 * 60 * 24 * 30)
  );

  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">Score global de forme</div>
      <div className="space-y-2.5">
        {bilans.map((b, i) => {
          const s = scores[i];
          const delta = i > 0 ? s - scores[i - 1] : null;
          const color = scoreColor(s);
          return (
            <div key={b.id ?? i} className="flex items-center gap-3 min-w-0">
              <div className="text-[11px] text-gray-500 flex-shrink-0 w-32 leading-tight">
                {bilanLabel(b, i, bilans.length)}
                <span className="text-gray-400 ml-1">({fmtDate(b.date)})</span>
              </div>
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden min-w-0">
                <div style={{ width: `${s}%`, background: color }} className="h-3 rounded-full transition-all duration-500" />
              </div>
              <span className="text-[11px] font-bold flex-shrink-0 w-12 text-right" style={{ color }}>{s}/100</span>
              {delta !== null && (
                <span className={`text-[11px] font-semibold flex-shrink-0 w-16 ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '—'} pts {delta > 0 ? '✅' : delta < 0 ? '⚠️' : '➡️'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs mt-3 font-semibold" style={{ color: scoreColor(scores[scores.length - 1]) }}>
        Progression globale : {totalDelta >= 0 ? '+' : ''}{totalDelta} pts en {mois} mois{' '}
        {totalDelta > 0 ? '✅' : totalDelta < 0 ? '⚠️' : '➡️'}
      </p>
    </div>
  );
}

// ─── 2. Heatmap ───────────────────────────────────────────────────────────────

function Heatmap({ bilans }: Props) {
  const activeTests = TESTS.filter(t => bilans.some(b => t.getValue(b) != null));

  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">Carte de chaleur</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-medium pb-2 pr-3 min-w-[80px]">Test</th>
              {bilans.map((b, i) => (
                <th key={i} className="text-center text-gray-500 font-medium pb-2 px-1.5 min-w-[64px]">
                  <div>{bilanLabel(b, i, bilans.length)}</div>
                  <div className="font-normal text-gray-400 text-[10px]">{fmtDate(b.date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTests.map(t => (
              <tr key={t.key}>
                <td className="text-gray-600 font-medium py-1 pr-3 text-[11px] whitespace-nowrap">{t.label}</td>
                {bilans.map((b, i) => {
                  const v = t.getValue(b);
                  if (v == null) return (
                    <td key={i} className="text-center py-1 px-1.5">
                      <span className="text-gray-300 text-[11px]">—</span>
                    </td>
                  );
                  const col = CAT[t.cat(v)];
                  return (
                    <td key={i} className="text-center py-1 px-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold"
                        style={{ background: col.bg, color: col.text }}>
                        {v}{t.unit}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 3. Barres comparatives ───────────────────────────────────────────────────

function BarresComparatives({ bilans }: Props) {
  const last = bilans.length - 1;
  const activeTests = TESTS.filter(t => bilans.some(b => t.getValue(b) != null));

  return (
    <div>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">Détail par test</div>
      <div className="grid grid-cols-2 gap-3">
        {activeTests.map(t => {
          const values = bilans.map(b => t.getValue(b));
          const nums = values.filter((v): v is number => v != null);
          if (!nums.length) return null;

          const maxVal = Math.max(...nums.map(Math.abs));
          const firstVal = nums[0];
          const lastVal = nums[nums.length - 1];
          const improved = t.lowerBetter ? lastVal < firstVal : lastVal > firstVal;
          const stable = lastVal === firstVal;
          const badge = stable ? '➡️' : improved ? '✅' : '⚠️';
          const badgeColor = stable ? '#9CA3AF' : improved ? '#1D9E75' : '#F59E0B';
          const rawDelta = t.lowerBetter ? firstVal - lastVal : lastVal - firstVal;
          const deltaLabel = `${rawDelta >= 0 ? '+' : ''}${+(rawDelta.toFixed(1))}${t.unit}`;

          return (
            <div key={t.key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="text-xs font-semibold text-gray-700 mb-2">{t.label}</div>
              <div className="space-y-1.5">
                {bilans.map((b, i) => {
                  const v = t.getValue(b);
                  if (v == null) return null;
                  const pct = maxVal > 0 ? (Math.abs(v) / maxVal) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 flex-shrink-0 w-12 truncate">
                        {bilanLabel(b, i, bilans.length)}
                      </span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div style={{ width: `${pct}%`, background: barColor(i, last) }}
                          className="h-2 rounded-full transition-all duration-500" />
                      </div>
                      <span className="text-[11px] font-semibold text-gray-700 flex-shrink-0 w-10 text-right">
                        {v}{t.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
              {nums.length > 1 && (
                <div className="mt-2 text-[11px] font-semibold" style={{ color: badgeColor }}>
                  {badge} {deltaLabel} depuis le début
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function BilanEvolutionCharts({ bilans }: Props) {
  const sorted = [...bilans].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length < 2) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Ajoutez au moins 2 bilans pour voir la progression
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ScoreGlobal bilans={sorted} />
      <div className="border-t border-gray-100 pt-5">
        <Heatmap bilans={sorted} />
      </div>
      <div className="border-t border-gray-100 pt-5">
        <BarresComparatives bilans={sorted} />
      </div>
    </div>
  );
}
