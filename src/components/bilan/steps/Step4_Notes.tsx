import type { Bilan } from '../../../types';
import { Sparkles } from 'lucide-react';

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  onGenerateMessage: () => void;
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none"
      />
    </div>
  );
}

export default function Step4_Notes({ form, update, onGenerateMessage }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-heading font-semibold text-dark">Notes professionnelles & Message</h2>

      <TextArea
        label="Notes professionnelles (non visibles du patient)"
        value={form.notesProfessionnelles}
        onChange={v => update({ notesProfessionnelles: v })}
        placeholder="Observations cliniques, comportement, ressenti général..."
        rows={4}
      />

      <TextArea
        label="Objectifs pour le prochain trimestre"
        value={form.objectifsSuivants}
        onChange={v => update({ objectifsSuivants: v })}
        placeholder="Ex : Renforcement MI, travail proprioception..."
      />

      <TextArea
        label="Points de vigilance"
        value={form.pointsVigilance}
        onChange={v => update({ pointsVigilance: v })}
        placeholder="Ex : Douleur genou droit à surveiller..."
      />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700">Message pour le patient</label>
          <button
            type="button"
            onClick={onGenerateMessage}
            className="flex items-center gap-1.5 text-xs bg-secondary/10 text-secondary hover:bg-secondary/20 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Sparkles size={13} />
            Générer automatiquement
          </button>
        </div>
        <textarea
          value={form.messageClient}
          onChange={e => update({ messageClient: e.target.value })}
          rows={4}
          placeholder="Message bienveillant et motivant pour le patient..."
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/10 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">Ce message sera visible dans l'espace client du patient.</p>
      </div>
    </div>
  );
}
