import { useState } from 'react';
import { X, Loader, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { Participant, Seance, TypeSeance } from '../../types';
import { addMinutes } from '../../utils/horaires';

// ── Création manuelle d'une séance (port de ModalCreerSeance, AgendaPage.tsx)
//    — n'importe quel bénéficiaire, avec ou sans contrat actif. Contrairement
//    au glisser-déposer (onDropFromOutside, réservé aux bénéficiaires sous
//    contrat actif pour générer une série récurrente), ce chemin crée une
//    séance ponctuelle unique — c'est le seul moyen de planifier un bilan
//    initial pour un prospect qui n'a pas encore de contrat. ─────────────────

export default function ModalCreerSeanceManuelle({ participants, detecterConflits, onCreer, onClose, initial }: {
  participants: Participant[];
  detecterConflits: (date: string, heureDebut: string, heureFin: string) => Seance[];
  onCreer: (data: Omit<Seance, 'id'>) => Promise<void>;
  onClose: () => void;
  initial?: { date?: string; heureDebut?: string };
}) {
  const [form, setForm] = useState({
    participantId: '',
    type: 'seance' as TypeSeance,
    date: initial?.date ?? format(new Date(), 'yyyy-MM-dd'),
    heureDebut: initial?.heureDebut ?? '09:00',
    dureeMinutes: 45,
    notes: '',
  });
  const [loading, setLoading] = useState(false);

  const participant = participants.find(p => p.id === form.participantId);
  const heureFin = addMinutes(form.heureDebut, form.dureeMinutes);
  const conflits = detecterConflits(form.date, form.heureDebut, heureFin);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.participantId) { toast.error('Choisissez un bénéficiaire'); return; }
    if (conflits.length > 0) { toast.error('Conflit horaire avec une autre séance'); return; }
    setLoading(true);
    try {
      await onCreer({
        participantId: form.participantId,
        type: form.type,
        date: form.date,
        heureDebut: form.heureDebut,
        heureFin,
        dureeMinutes: form.dureeMinutes,
        statut: 'planifiee',
        notes: form.notes,
        adresse: [participant?.adresseRue, participant?.adresseCodePostal, participant?.adresseVille].filter(Boolean).join(', '),
        coordonnees: participant?.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined,
      });
      toast.success('Séance créée');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Nouvelle séance</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bénéficiaire *</label>
            <select value={form.participantId} onChange={e => setForm(f => ({ ...f, participantId: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
              <option value="">Choisir un bénéficiaire… (avec ou sans contrat)</option>
              {participants.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TypeSeance }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
              <option value="seance">Séance</option>
              <option value="bilan">Bilan</option>
              <option value="bilan_initial">Bilan initial</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Heure *</label>
              <input type="time" step={60} value={form.heureDebut} onChange={e => setForm(f => ({ ...f, heureDebut: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Durée : {form.dureeMinutes} min → fin à {heureFin}</label>
            <input type="number" min={15} max={180} step={5} value={form.dureeMinutes}
              onChange={e => setForm(f => ({ ...f, dureeMinutes: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          {participant && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
              <MapPin size={12} />
              {[participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ') || 'Adresse non renseignée'}
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Observations rapides…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          {conflits.length > 0 && (
            <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red">Conflit horaire avec une autre séance ({conflits[0].heureDebut}–{conflits[0].heureFin}).</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm">
              Annuler
            </button>
            <button type="submit" disabled={loading || conflits.length > 0}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><Loader size={14} className="animate-spin" />En cours…</> : 'Créer la séance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
