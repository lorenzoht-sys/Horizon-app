import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { EvenementAgenda } from '../../types';
import { formatDate, LABEL_TYPE_EVENEMENT } from '../../lib/agendaCommun';

export default function ModalEvenementAgenda({ evenement, onDelete, onClose }: {
  evenement: EvenementAgenda;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">{LABEL_TYPE_EVENEMENT[evenement.type]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Titre</p>
              <p className="text-sm font-semibold text-dark truncate">{evenement.titre}</p>
            </div>
            <span className="w-5 h-5 rounded-full border border-black/10 flex-shrink-0" style={{ backgroundColor: evenement.couleur }} title={evenement.couleur} />
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Quand</p>
            <p className="text-sm font-semibold text-dark">
              {formatDate(evenement.date)} — {evenement.heureDebut} à {evenement.heureFin}
            </p>
          </div>
          {(evenement.nom || evenement.prenom) && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Contact</p>
              <p className="text-sm font-semibold text-dark">{[evenement.prenom, evenement.nom].filter(Boolean).join(' ')}</p>
            </div>
          )}
          {evenement.adresse && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Adresse</p>
              <p className="text-sm text-dark">{evenement.adresse}</p>
            </div>
          )}
          {evenement.telephone && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Téléphone</p>
              <p className="text-sm text-dark">{evenement.telephone}</p>
            </div>
          )}
          {evenement.notes && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Notes</p>
              <p className="text-sm text-dark whitespace-pre-wrap">{evenement.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={() => setConfirmSuppr(true)}
            className="flex items-center justify-center border border-red/20 text-red rounded-xl px-3 hover:bg-red-light transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Fermer
          </button>
        </div>

        {confirmSuppr && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1020 }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <p className="text-sm text-dark font-medium mb-1">Supprimer cet événement ?</p>
              <p className="text-xs text-gray-500 mb-4">
                {evenement.titre} — {formatDate(evenement.date)}. Action irréversible.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmSuppr(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={onDelete}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red text-white hover:opacity-90">
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
