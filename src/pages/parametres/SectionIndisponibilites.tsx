import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import type { Indisponibilite, JourSemaine } from '../../types';
import { supabase } from '../../lib/supabase';
import { listerIndisponibilites, ajouterIndisponibilite, supprimerIndisponibilite } from '../../lib/acces/indisponibilites';

export const JOURS_LABELS: Record<JourSemaine | 'dim', string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

// ── Section indisponibilités — données Supabase ────────────────────────────────

export interface ModalIndispoProps {
  onSave: (item: Indisponibilite) => void;
  onClose: () => void;
}

export function ModalAjoutIndispo({ onSave, onClose }: ModalIndispoProps) {
  const [form, setForm] = useState<Omit<Indisponibilite, 'id'>>({
    jour: 'lun', heureDebut: '12:00', heureFin: '14:00',
    recurrente: true, label: '',
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-heading font-bold text-dark text-lg">Ajouter une indisponibilité</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Jour</label>
          <select
            value={form.jour}
            onChange={e => setForm(f => ({ ...f, jour: e.target.value as JourSemaine | 'dim' }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            {(Object.entries(JOURS_LABELS) as [JourSemaine | 'dim', string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">De</label>
            <input type="time" value={form.heureDebut}
              onChange={e => setForm(f => ({ ...f, heureDebut: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">À</label>
            <input type="time" value={form.heureFin}
              onChange={e => setForm(f => ({ ...f, heureFin: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={form.recurrente}
            onChange={e => setForm(f => ({ ...f, recurrente: e.target.checked }))}
            className="w-4 h-4 accent-primary" />
          <span className="text-sm text-gray-700">Récurrent chaque semaine</span>
        </label>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Libellé (optionnel)</label>
          <input value={form.label ?? ''}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Ex: Déjeuner, Formation..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onSave({ ...form, id: uuidv4() })}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors"
          >
            Enregistrer
          </button>
          <button onClick={onClose}
            className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export function SectionIndisponibilites() {
  const [indispos, setIndispos] = useState<Indisponibilite[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    listerIndisponibilites()
      .then(({ data, error }) => {
        if (error) { console.error('Erreur chargement indispos:', error); return; }
        setIndispos((data ?? []).map(row => ({
          id: row.id,
          jour: row.jour as Indisponibilite['jour'],
          heureDebut: row.heure_debut,
          heureFin: row.heure_fin,
          recurrente: row.recurrente,
          label: row.label ?? '',
        })));
      });
  }, []);

  async function handleSave(item: Indisponibilite) {
    if (supabase) {
      const { error } = await ajouterIndisponibilite({
        id: item.id,
        jour: item.jour,
        heure_debut: item.heureDebut,
        heure_fin: item.heureFin,
        recurrente: item.recurrente,
        label: item.label || null,
      });
      if (error) { toast.error('Erreur lors de la sauvegarde'); return; }
    }
    setIndispos(prev => [...prev, item]);
    setShowModal(false);
    toast.success('Indisponibilité ajoutée');
  }

  async function handleDelete(id: string) {
    if (supabase) {
      await supprimerIndisponibilite(id);
    }
    setIndispos(prev => prev.filter(i => i.id !== id));
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Mes indisponibilités</h2>
        <div className="h-px bg-gray-100" />
      </div>

      <div className="space-y-2 mb-4">
        {indispos.length === 0 && (
          <p className="text-sm text-gray-400">Aucune indisponibilité enregistrée.</p>
        )}
        {indispos.map(item => (
          <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <div>
              <span className="text-sm font-semibold text-dark">{JOURS_LABELS[item.jour]}</span>
              <span className="text-sm text-gray-500 ml-2">{item.heureDebut} → {item.heureFin}</span>
              {item.recurrente && <span className="ml-2 text-xs text-primary">🔄 hebdo</span>}
              {item.label && <span className="ml-2 text-xs text-gray-400">· {item.label}</span>}
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 border border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
      >
        <Plus size={16} />
        Ajouter une indisponibilité
      </button>

      {showModal && <ModalAjoutIndispo onSave={handleSave} onClose={() => setShowModal(false)} />}
    </section>
  );
}
