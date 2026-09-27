import { useState } from 'react';
import { X, Loader } from 'lucide-react';
import { format } from 'date-fns';
import type { EvenementAgenda, TypeEvenementAgenda } from '../../types';
import { OPTIONS_TYPE_EVENEMENT, LABEL_TYPE_EVENEMENT, COULEUR_EVENEMENT_PAR_DEFAUT } from '../../lib/agendaCommun';

// ── Événements d'agenda (indisponibilité ponctuelle, réunion, premier contact
//    prospect) — formulaire de création et fiche de consultation/suppression.
//    Volontairement plus simple qu'une séance : pas de bénéficiaire, pas de
//    contrat, pas de chevauchement vérifié (un événement d'agenda n'occupe
//    pas un créneau de tournée patient, il informe seulement). ─────────────

export default function ModalNouvelEvenement({ onCreer, onCancel }: {
  onCreer: (data: Omit<EvenementAgenda, 'id'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<TypeEvenementAgenda>('reunion');
  const [titre, setTitre] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [couleur, setCouleur] = useState(COULEUR_EVENEMENT_PAR_DEFAUT);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [heureDebut, setHeureDebut] = useState('09:00');
  const [heureFin, setHeureFin] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const heureInvalide = heureFin <= heureDebut;

  async function handleCreer() {
    if (!titre.trim() || heureInvalide) return;
    setLoading(true);
    try {
      await onCreer({
        type, titre: titre.trim(), date, heureDebut, heureFin,
        notes: notes.trim() || undefined,
        nom: nom.trim() || undefined,
        prenom: prenom.trim() || undefined,
        adresse: adresse.trim() || undefined,
        telephone: telephone.trim() || undefined,
        couleur,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Ajouter un événement d'agenda</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value as TypeEvenementAgenda)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
              {OPTIONS_TYPE_EVENEMENT.map(t => <option key={t} value={t}>{LABEL_TYPE_EVENEMENT[t]}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Titre</label>
            <input type="text" value={titre} onChange={e => setTitre(e.target.value)}
              placeholder="Ex : Réunion équipe, Mme Dupont (prospect)…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nom (optionnel)</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prénom (optionnel)</label>
              <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Adresse (optionnel)</label>
            <input type="text" value={adresse} onChange={e => setAdresse(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Téléphone (optionnel)</label>
              <input type="tel" value={telephone} onChange={e => setTelephone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Couleur</label>
              <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-1.5">
                <input type="color" value={couleur} onChange={e => setCouleur(e.target.value)}
                  className="w-8 h-8 rounded-md border-0 cursor-pointer bg-transparent" />
                <span className="text-xs text-gray-500 uppercase">{couleur}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fin</label>
              <input type="time" step={60} value={heureFin} onChange={e => setHeureFin(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>
          {heureInvalide && <p className="text-xs text-red">L'heure de fin doit être après l'heure de début.</p>}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleCreer} disabled={loading || !titre.trim() || heureInvalide}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50 flex items-center justify-center">
            {loading ? <Loader size={14} className="animate-spin" /> : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
