import { useState } from 'react';
import { X, Loader, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Contrat, Seance } from '../../types';
import { getAuthHeader } from '../../lib/supabase';

interface Props {
  onClose: () => void;
  contrats: Contrat[];
  seances: Seance[];
  onSuccess?: () => void;
}

export default function ModalPlanificateur({ onClose, contrats, seances, onSuccess }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const actifIds = contrats.filter(c => c.statut === 'actif').map(c => c.id);
  const nbPlanifiees = seances.filter(s =>
    s.contratId != null && actifIds.includes(s.contratId) &&
    s.statut === 'planifiee' && s.date >= today,
  ).length;

  async function handleReset() {
    setApplying(true);
    try {
      const authHeader = await getAuthHeader();
      const r = await fetch('/api/seances/supprimer-planifiees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ contratIds: actifIds, dateMin: today }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw new Error((detail as { error?: string }).error ?? 'Erreur suppression');
      }
      onSuccess?.();
      toast.success('Planning remis à zéro');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la remise à zéro');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1001 }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Remettre à zéro le planning</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            Ceci va supprimer{' '}
            <span className="font-semibold text-dark">{nbPlanifiees} séance{nbPlanifiees > 1 ? 's' : ''} planifiée{nbPlanifiees > 1 ? 's' : ''}</span>
            {' '}futures pour tous vos contrats actifs.
          </p>
          <p className="text-xs text-gray-400">
            Les séances déjà réalisées ou annulées ne sont pas affectées. Vous pourrez ensuite replanifier via la grille hebdomadaire.
          </p>

          {showConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-medium">
                Cette action est irréversible. Confirmez-vous la suppression de {nbPlanifiees} séance{nbPlanifiees > 1 ? 's' : ''} ?
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={nbPlanifiees === 0}
              className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-40"
            >
              Remettre à zéro
            </button>
          ) : (
            <button
              onClick={handleReset}
              disabled={applying}
              className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {applying ? <><Loader size={14} className="animate-spin" />Suppression…</> : 'Confirmer la remise à zéro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
