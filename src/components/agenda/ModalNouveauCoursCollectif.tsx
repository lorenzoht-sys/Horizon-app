import { useState } from 'react';
import { X, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant, Structure, ProgrammeModele, ModeFacturationCours } from '../../types';

interface Props {
  participants: Participant[];
  structures: Structure[];
  programmesModeles: ProgrammeModele[];
  initialDate?: string;
  onCreer: (data: {
    structureId?: string;
    titre: string;
    date: string;
    heureDebut: string;
    dureeMinutes: number;
    programmeCommunId?: string;
    modeFacturation: ModeFacturationCours;
    participantIds: string[];
  }) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Création d'un cours collectif — praticien/desktop uniquement, même
 * réserve que les autres chantiers de gestion (contacts pro, tarifs de
 * contrat). Le mode de facturation "structure" impose une structure
 * (contrainte DB cours_collectifs_structure_requise_si_facturation_structure) :
 * le formulaire la reproduit côté client pour ne pas laisser l'utilisateur
 * découvrir l'erreur seulement à l'enregistrement.
 */
export default function ModalNouveauCoursCollectif({ participants, structures, programmesModeles, initialDate, onCreer, onClose }: Props) {
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(initialDate ?? new Date().toISOString().slice(0, 10));
  const [heureDebut, setHeureDebut] = useState('10:00');
  const [dureeMinutes, setDureeMinutes] = useState(45);
  const [structureId, setStructureId] = useState('');
  const [modeFacturation, setModeFacturation] = useState<ModeFacturationCours>('individuel');
  const [programmeCommunId, setProgrammeCommunId] = useState('');
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const participantsFiltres = [...participants]
    .filter(p => !search.trim() || `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  function toggleParticipant(id: string) {
    setParticipantIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function valider() {
    if (!titre.trim()) { toast.error('Le titre est obligatoire'); return; }
    if (!date || !heureDebut || dureeMinutes <= 0) { toast.error('Date, heure et durée sont obligatoires'); return; }
    if (modeFacturation === 'structure' && !structureId) {
      toast.error('Une structure est obligatoire en facturation "structure"');
      return;
    }
    if (participantIds.size === 0) { toast.error('Sélectionnez au moins un participant'); return; }

    setSaving(true);
    const ok = await onCreer({
      structureId: structureId || undefined,
      titre: titre.trim(),
      date,
      heureDebut,
      dureeMinutes,
      programmeCommunId: programmeCommunId || undefined,
      modeFacturation,
      participantIds: [...participantIds],
    });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-dark flex items-center gap-2">
            <Users size={18} /> Nouveau cours collectif
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">Titre</span>
            <input
              type="text" value={titre} onChange={e => setTitre(e.target.value)} autoFocus
              placeholder="Gym douce, Équilibre en groupe…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">Date</span>
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Heure</span>
              <input
                type="time" value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Durée (min)</span>
              <input
                type="number" min={5} step={5} value={dureeMinutes}
                onChange={e => setDureeMinutes(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-gray-500">Structure (optionnel)</span>
            <select
              value={structureId} onChange={e => setStructureId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
            >
              <option value="">— Aucune —</option>
              {structures.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Facturation</span>
            <select
              value={modeFacturation}
              onChange={e => setModeFacturation(e.target.value as ModeFacturationCours)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
            >
              <option value="individuel">Individuelle — chaque présent facturé à son tarif de contrat</option>
              <option value="structure">Structure — le cours facturé à la structure, tarif forfaitaire</option>
            </select>
            {modeFacturation === 'structure' && !structureId && (
              <span className="text-xs text-red-500 mt-1 block">Une structure est requise pour ce mode.</span>
            )}
          </label>

          {programmesModeles.length > 0 && (
            <label className="block">
              <span className="text-xs text-gray-500">Programme commun (optionnel)</span>
              <select
                value={programmeCommunId} onChange={e => setProgrammeCommunId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-0.5 focus:outline-none focus:border-primary"
              >
                <option value="">— Aucun —</option>
                {programmesModeles.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </label>
          )}

          <div>
            <span className="text-xs text-gray-500">Participants ({participantIds.size} sélectionné{participantIds.size > 1 ? 's' : ''})</span>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-0.5 mb-2 focus:outline-none focus:border-primary"
            />
            <div className="space-y-1 max-h-56 overflow-y-auto border border-gray-100 rounded-xl p-2">
              {participantsFiltres.map(p => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer select-none py-1 px-1.5 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox" checked={participantIds.has(p.id)} onChange={() => toggleParticipant(p.id)}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                  <span className="text-sm text-dark">{p.prenom} {p.nom}</span>
                </label>
              ))}
              {participantsFiltres.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-2">Aucun participant</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={valider} disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-50"
          >
            {saving ? 'Création…' : 'Créer le cours'}
          </button>
        </div>
      </div>
    </div>
  );
}
