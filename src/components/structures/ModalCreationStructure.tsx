import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Structure } from '../../types';
import { TYPE_LABELS } from './CarteStructure';

export default function ModalCreationStructure({ onClose, onCreer }: {
  onClose: () => void;
  onCreer: (data: Omit<Structure, 'id' | 'praticienId' | 'tokenAcces' | 'actif' | 'createdAt'>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    nom: '', type: '' as Structure['type'] | '',
    adresse: '', contactNom: '', contactEmail: '', contactTelephone: '',
    tarifSeance: 45, frequenceFacturation: 'mensuelle' as Structure['frequenceFacturation'],
  });
  const [loading, setLoading] = useState(false);
  const CLS = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim() || !form.contactEmail.trim()) { toast.error('Nom et email contact requis'); return; }
    setLoading(true);
    try {
      await onCreer({
        nom: form.nom.trim(),
        type: form.type || undefined,
        adresse: form.adresse || undefined,
        contactNom: form.contactNom || undefined,
        contactEmail: form.contactEmail.trim(),
        contactTelephone: form.contactTelephone || undefined,
        tarifSeance: form.tarifSeance,
        frequenceFacturation: form.frequenceFacturation,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-heading font-bold text-dark text-lg">Créer une structure</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-dark"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de la structure *</label>
              <input className={CLS} value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="EHPAD Les Rosiers" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select className={CLS} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Structure['type'] }))}>
                <option value="">— Choisir —</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse</label>
              <input className={CLS} value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="12 rue des Acacias, Nantes" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Contact</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom du contact</label>
                <input className={CLS} value={form.contactNom} onChange={e => setForm(f => ({ ...f, contactNom: e.target.value }))} placeholder="Marie Durand" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                <input type="email" className={CLS} value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="m.durand@ehpad.fr" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
                <input className={CLS} value={form.contactTelephone} onChange={e => setForm(f => ({ ...f, contactTelephone: e.target.value }))} placeholder="02 40 XX XX XX" />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Facturation</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarif séance (€) *</label>
                <input type="number" className={CLS} value={form.tarifSeance} min={0} onChange={e => setForm(f => ({ ...f, tarifSeance: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fréquence</label>
                <select className={CLS} value={form.frequenceFacturation} onChange={e => setForm(f => ({ ...f, frequenceFacturation: e.target.value as Structure['frequenceFacturation'] }))}>
                  <option value="mensuelle">Mensuelle</option>
                  <option value="bimensuelle">Bimensuelle</option>
                  <option value="a_la_seance">À la séance</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-50">
              {loading ? 'Création…' : 'Créer la structure'}
            </button>
            <button type="button" onClick={onClose} className="px-5 border border-gray-200 rounded-xl text-gray-600 text-sm hover:bg-gray-50">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}
