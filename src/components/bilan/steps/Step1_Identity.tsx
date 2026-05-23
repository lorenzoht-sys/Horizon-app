import type { Bilan } from '../../../types';

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  nextTrimestre: number;
}

export default function Step1_Identity({ form, update, nextTrimestre }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-heading font-semibold text-dark">Identification du bilan</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Date du bilan</label>
        <input
          type="date"
          value={form.date}
          onChange={e => update({ date: e.target.value })}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Type de bilan</label>
        <div className="flex gap-3">
          {(['initial', 'trimestriel'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => update({ type, trimestre: type === 'initial' ? 0 : nextTrimestre })}
              className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                form.type === type
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 text-gray-600 hover:border-primary/50'
              }`}
            >
              {type === 'initial' ? 'Bilan initial' : 'Bilan trimestriel'}
            </button>
          ))}
        </div>
      </div>

      {form.type === 'trimestriel' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Numéro de trimestre</label>
          <input
            type="number"
            min={1}
            value={form.trimestre}
            onChange={e => update({ trimestre: Number(e.target.value) })}
            className="w-32 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  );
}
