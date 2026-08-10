import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Tm6Variante } from '../../types';

const TYPE_MESURE_LABELS: Record<Tm6Variante['typeMesure'], string> = {
  distance: 'Distance (mètres)',
  pas: 'Nombre de pas',
  tours: 'Nombre de tours',
};

interface Props {
  variantes: Tm6Variante[];
  loading: boolean;
  creer: (nom: string, typeMesure: Tm6Variante['typeMesure'], distanceRef?: number | null) => Promise<Tm6Variante | null>;
  supprimer: (id: string) => Promise<void>;
  onClose: () => void;
  onCreated: (variante: Tm6Variante) => void;
}

export default function Tm6VariantesModal({ variantes, loading, creer, supprimer, onClose, onCreated }: Props) {
  const [form, setForm] = useState<{ nom: string; typeMesure: Tm6Variante['typeMesure']; distanceRef: string }>({
    nom: '', typeMesure: 'distance', distanceRef: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.nom.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    const variante = await creer(form.nom.trim(), form.typeMesure, form.distanceRef ? Number(form.distanceRef) : null);
    setSaving(false);
    if (!variante) { toast.error('Erreur lors de la création'); return; }
    setForm({ nom: '', typeMesure: 'distance', distanceRef: '' });
    toast.success('Variante créée');
    onCreated(variante);
  }

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer la variante "${nom}" ?`)) return;
    await supprimer(id);
    toast.success('Variante supprimée');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-heading font-bold text-dark text-lg">Variantes du TM6</h3>
          <p className="text-xs text-gray-500 mt-0.5">Stepper, pédalier, couloir… elles apparaîtront dans le menu "Type de test".</p>
        </div>

        {loading ? (
          <p className="text-xs text-gray-400">Chargement…</p>
        ) : variantes.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {variantes.map(v => (
              <div key={v.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="text-sm font-medium text-dark">{v.nom}</span>
                  <span className="ml-2 text-xs text-gray-400">{TYPE_MESURE_LABELS[v.typeMesure]}</span>
                  {v.distanceRef && <span className="ml-2 text-xs text-gray-400">ref. {v.distanceRef} m</span>}
                </div>
                <button onClick={() => handleDelete(v.id, v.nom)} className="text-gray-400 hover:text-red-500 transition-colors" aria-label={`Supprimer ${v.nom}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nom</label>
            <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              placeholder="ex : Stepper Tunturi, Pédalier couché, Couloir 30m"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Mesure</label>
              <select value={form.typeMesure} onChange={e => setForm(f => ({ ...f, typeMesure: e.target.value as Tm6Variante['typeMesure'] }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
                {(Object.entries(TYPE_MESURE_LABELS) as [Tm6Variante['typeMesure'], string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Distance référence (m) — optionnel</label>
              <input type="number" min={0} value={form.distanceRef} onChange={e => setForm(f => ({ ...f, distanceRef: e.target.value }))}
                placeholder="ex : 400"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-dark transition-colors disabled:opacity-50">
              {saving ? 'Création…' : 'Créer la variante'}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-500 hover:text-dark transition-colors">
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
