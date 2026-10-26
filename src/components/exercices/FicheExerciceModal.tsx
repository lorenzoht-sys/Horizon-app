import { X } from 'lucide-react';
import type { Exercice, ProfilHandicap, ProfilPathologie } from '../../types';
import ExerciceCard from '../../programme/ExerciceCard';

// Fiche complète d'un exercice, ouverte depuis une carte compacte de la bibliothèque. Le contenu est
// celui de l'ancienne carte (ExerciceCard non compacte) : rien n'est perdu, il est juste déplacé.
//
// z-[1100] : même valeur que les autres modales de la bibliothèque, au-dessus de
// BarreNavigationMobile (z-index 100) ; max-h et items-center, comme DossierModal, pour que le pied
// de fenêtre reste atteignable au-dessus de la barre du bas.

export default function FicheExerciceModal({ exercice, profil, onClose }: {
  exercice: Exercice;
  profil?: ProfilHandicap | ProfilPathologie;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={exercice.nom}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fiche exercice</span>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-400 hover:text-dark p-1"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <ExerciceCard exercice={exercice} profilHandicap={profil} />
        </div>
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
