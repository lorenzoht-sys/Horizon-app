import type { Bilan, TagPatient } from '../../../types';
import { TAG_CONFIG, TAG_ORDER } from '../../../data/profiles';

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  selectedTags: TagPatient[];
  onToggleTag: (tag: TagPatient) => void;
  contexteClinic: string;
  onContexteChange: (v: string) => void;
}

function sectionsCount(tags: TagPatient[]): number {
  const base = 2; // commun + tests
  return base + tags.length;
}

export default function StepInitial1_Tags({ form, update, selectedTags, onToggleTag, contexteClinic, onContexteChange }: Props) {
  const total = sectionsCount(selectedTags);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-heading font-semibold text-dark mb-1">
          Quel(s) profil(s) correspond(ent) à ce patient ?
        </h2>
        <p className="text-sm text-gray-400">Plusieurs choix possibles — cochez tout ce qui s'applique.</p>
      </div>

      {/* Grid des tags */}
      <div className="grid grid-cols-2 gap-3">
        {TAG_ORDER.map(tag => {
          const cfg = TAG_CONFIG[tag];
          const selected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              style={selected ? { borderColor: cfg.color, backgroundColor: `${cfg.color}10` } : undefined}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                selected ? 'shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-2xl">{cfg.emoji}</span>
                {selected ? (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: cfg.color }}
                  >
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
              </div>
              <div className="mt-2">
                <div
                  className="text-sm font-semibold"
                  style={selected ? { color: cfg.color } : { color: '#1e293b' }}
                >
                  {cfg.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{cfg.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Résumé des sections */}
      {selectedTags.length > 0 ? (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary font-medium">
          {selectedTags.length} profil{selectedTags.length > 1 ? 's' : ''} sélectionné{selectedTags.length > 1 ? 's' : ''} —{' '}
          {total} étape{total > 1 ? 's' : ''} de questions seront affichées
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-400">
          Aucun profil sélectionné — seules les questions communes et les tests seront affichés.
        </div>
      )}

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Date du bilan initial</label>
        <input
          type="date"
          value={form.date}
          onChange={e => update({ date: e.target.value })}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </div>

      {/* Contexte clinique */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Contexte clinique <span className="text-gray-400 font-normal">(optionnel)</span>
        </label>
        <input
          type="text"
          value={contexteClinic}
          onChange={e => onContexteChange(e.target.value)}
          placeholder="ex : PTH droite + diabète type 2, opéré le 15/01/2025"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </div>
    </div>
  );
}
