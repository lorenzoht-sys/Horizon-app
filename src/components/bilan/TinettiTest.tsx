import type { TinettiData, TinettiEquilibre, TinettiMarche } from '../../types';
import {
  EQUILIBRE_ITEMS, MARCHE_ITEMS, TINETTI_EQUILIBRE_MAX, TINETTI_MARCHE_MAX,
  TINETTI_TOTAL_MAX, TINETTI_ITEMS_COUNT, emptyTinettiData, computeTinettiScores, tinettiRisque,
  type TinettiItem,
} from '../../data/tinetti';

interface Props {
  value: TinettiData | undefined;
  onChange: (v: TinettiData) => void;
  hideHeader?: boolean;
}

function ItemRow<K extends string>({ item, value, onSelect, groupId }: {
  item: TinettiItem<K>;
  value: 0 | 1 | 2 | null;
  onSelect: (v: 0 | 1 | 2) => void;
  groupId: string;
}) {
  const labelId = `${groupId}-${String(item.key)}-label`;
  return (
    <div className="mb-3">
      <p id={labelId} className="text-xs font-semibold text-gray-700 mb-1.5">{item.label}</p>
      <div role="group" aria-labelledby={labelId} className={`grid gap-2 ${item.options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {item.options.map(opt => {
          const active = value === opt.v;
          return (
            <button key={opt.v} type="button"
              aria-label={`${item.label} — score ${opt.v} : ${opt.label}`}
              aria-pressed={active}
              onClick={() => onSelect(opt.v)}
              className={`rounded-xl border-2 px-3 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                active ? 'bg-primary border-primary text-white' : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
              }`}>
              <div className="font-black text-base">{opt.v}</div>
              <div className={`text-[11px] leading-tight mt-0.5 ${active ? 'text-white/90' : 'text-gray-500'}`}>{opt.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TinettiTest({ value, onChange, hideHeader = false }: Props) {
  const t = value ?? emptyTinettiData();

  function setEquilibre<K extends keyof TinettiEquilibre>(key: K, v: 0 | 1 | 2) {
    onChange({ ...t, equilibre: { ...t.equilibre, [key]: v } });
  }
  function setMarche<K extends keyof TinettiMarche>(key: K, v: 0 | 1 | 2) {
    onChange({ ...t, marche: { ...t.marche, [key]: v } });
  }

  const scores = computeTinettiScores(t);
  const risque = scores ? tinettiRisque(scores.scoreTotal) : null;

  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Test de Tinetti (POMA)</h3>
          {!scores?.complet && (
            <span className="text-xs text-gray-400">{scores?.itemsRenseignes ?? 0}/{TINETTI_ITEMS_COUNT} items renseignés</span>
          )}
        </div>
      )}
      {!hideHeader && <p className="text-xs text-gray-400 mb-4">Équilibre &amp; marche — risque de chute</p>}

      {/* Progression quand header masqué */}
      {hideHeader && !scores?.complet && (
        <p className="text-xs text-gray-400 mb-4">
          {scores?.itemsRenseignes ?? 0}/{TINETTI_ITEMS_COUNT} items renseignés
        </p>
      )}

      {/* Équilibre */}
      <div className="mb-5">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Équilibre (/{TINETTI_EQUILIBRE_MAX})</p>
        {EQUILIBRE_ITEMS.map(item => (
          <ItemRow key={item.key} item={item} value={t.equilibre[item.key]} onSelect={v => setEquilibre(item.key, v)} groupId="tinetti-equilibre" />
        ))}
      </div>

      {/* Marche */}
      <div className="mb-5">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-3">Marche (/{TINETTI_MARCHE_MAX})</p>
        {MARCHE_ITEMS.map(item => (
          <ItemRow key={item.key} item={item} value={t.marche[item.key]} onSelect={v => setMarche(item.key, v)} groupId="tinetti-marche" />
        ))}
      </div>

      {/* Conclusion */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-5">
        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
          <span>Équilibre : {scores?.scoreEquilibre ?? 0}/{TINETTI_EQUILIBRE_MAX}</span>
          <span>Marche : {scores?.scoreMarche ?? 0}/{TINETTI_MARCHE_MAX}</span>
          <span>Total : {scores?.scoreTotal ?? 0}/{TINETTI_TOTAL_MAX}</span>
        </div>
        {scores?.complet && risque ? (
          <div className="mt-2 rounded-lg px-3 py-2 inline-flex items-center text-sm font-semibold"
            style={{ background: risque.bg, color: risque.color }}>
            {risque.label}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-2">
            {scores?.itemsRenseignes ?? 0}/{TINETTI_ITEMS_COUNT} items — interprétation affichée une fois le test complet
          </p>
        )}
      </div>

      <div>
        <label htmlFor="tinetti-notes" className="block text-xs text-gray-500 mb-1">Notes cliniques</label>
        <textarea
          id="tinetti-notes"
          value={t.notes}
          onChange={e => onChange({ ...t, notes: e.target.value })}
          placeholder="Observations complémentaires..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
        />
      </div>
    </div>
  );
}
