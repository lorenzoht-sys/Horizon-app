import type { ChutesData, ChuteDetail } from '../../../types';
import { TYPES_BLESSURE_CHUTE } from '../../../types';
import { Echelle5, ToggleOuiNon } from './Champs';
import { CLS_CELL, genId } from './communs';

// ─── ANTÉCÉDENTS DE CHUTES (MOD3) ───────────────────────────────────────────────

export function ChuteCard({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: ChuteDetail;
  index: number;
  onChange: (patch: Partial<ChuteDetail>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-gray-100 rounded-xl p-3.5 mb-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-400">Chute {index + 1}</span>
        <button type="button" onClick={onRemove}
          className="text-xs text-red-400 hover:text-red-600">🗑️ Supprimer</button>
      </div>

      <div className="mb-2.5">
        <label className="text-[11px] font-medium text-gray-500 mb-1 block">Date approximative (MM/AAAA)</label>
        <input type="text" value={item.dateApprox ?? ''} onChange={e => onChange({ dateApprox: e.target.value })}
          placeholder="03/2025" className={`w-full ${CLS_CELL}`} />
      </div>

      <div className="mb-2.5">
        <label className="text-[11px] font-medium text-gray-500 mb-1 block">Circonstances</label>
        <input type="text" value={item.circonstances ?? ''} onChange={e => onChange({ circonstances: e.target.value })}
          placeholder="Bain, escaliers, sol glissant, vertige, nuit..." className={`w-full ${CLS_CELL}`} />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <span className="text-[11px] font-medium text-gray-500">Blessure occasionnée ?</span>
        <ToggleOuiNon value={item.blessure} onChange={v => onChange({ blessure: v })} />
      </div>

      {item.blessure === 'oui' && (
        <div className="mb-2.5 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {TYPES_BLESSURE_CHUTE.map(t => (
              <button key={t} type="button" onClick={() => onChange({ typeBlessure: item.typeBlessure === t ? null : t })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  item.typeBlessure === t
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-white'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <input type="text" value={item.detailBlessure ?? ''} onChange={e => onChange({ detailBlessure: e.target.value })}
            placeholder="Détails..." className={`w-full ${CLS_CELL}`} />
        </div>
      )}

      <Echelle5
        label="Confiance depuis cette chute (1-5)"
        value={item.confiance}
        onChange={n => onChange({ confiance: n })}
      />
    </div>
  );
}

export function ChutesForm({
  value,
  onChange,
}: {
  value: ChutesData;
  onChange: (v: ChutesData) => void;
}) {
  const items = value.chutesDetail ?? [];
  const add = () => onChange({ ...value, chutesDetail: [...items, { id: genId() }] });
  const remove = (id: string) => onChange({ ...value, chutesDetail: items.filter(i => i.id !== id) });
  const upd = (id: string, patch: Partial<ChuteDetail>) =>
    onChange({ ...value, chutesDetail: items.map(i => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">A-t-il déjà fait des chutes ?</span>
        <ToggleOuiNon value={value.aChutes} onChange={v => onChange({ ...value, aChutes: v })} />
      </div>

      {value.aChutes === 'oui' && (
        <div className="border-t border-gray-100 pt-3">
          {items.map((item, i) => (
            <ChuteCard
              key={item.id}
              item={item}
              index={i}
              onChange={patch => upd(item.id, patch)}
              onRemove={() => remove(item.id)}
            />
          ))}
          <button type="button" onClick={add}
            className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            + Ajouter une chute
          </button>
        </div>
      )}
    </div>
  );
}
