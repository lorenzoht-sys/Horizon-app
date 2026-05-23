import { X } from 'lucide-react';
import type { BrouillonBilan } from '../../hooks/useBrouillonBilan';

function formatDateFR(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `il y a ${h}h`;
  const j = Math.floor(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

interface Props {
  brouillon: BrouillonBilan;
  participantNom: string;
  onReprendre: () => void;
  onRecommencer: () => void;
  onFermer?: () => void;
}

export default function ModalRepriseBrouillon({
  brouillon, participantNom, onReprendre, onRecommencer, onFermer,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100">
      <div className="flex items-start justify-between mb-1">
        <div className="text-3xl">📋</div>
        {onFermer && (
          <button onClick={onFermer} className="text-gray-400 hover:text-dark transition-colors p-1">
            <X size={18} />
          </button>
        )}
      </div>

      <h2 className="font-heading font-bold text-dark text-lg mb-1">Bilan en cours</h2>
      <p className="text-sm text-gray-400 mb-4">{participantNom}</p>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 text-sm text-amber-800 space-y-1 leading-relaxed">
        <div>Commencé le <strong>{formatDateFR(brouillon.dateCreation)}</strong></div>
        <div>Dernière modification : {formatRelative(brouillon.dateDerniereModif)}</div>
        <div>
          Progression :{' '}
          <strong>{brouillon.completionPct}%</strong>{' '}
          · Étape {brouillon.etapeActuelle + 1}
        </div>
      </div>

      {/* Barre de progression */}
      <div className="h-2 bg-gray-100 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full rounded-full bg-secondary transition-all"
          style={{ width: `${brouillon.completionPct}%` }}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={onReprendre}
          className="flex-1 bg-primary text-white py-3 rounded-xl text-sm font-bold hover:bg-dark transition-colors"
        >
          ↩️ Reprendre le bilan
        </button>
        <button
          onClick={onRecommencer}
          className="flex-1 bg-gray-50 text-gray-600 py-3 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          🗑️ Recommencer
        </button>
      </div>
    </div>
  );
}
