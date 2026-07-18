import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useProgrammesModeles } from '../../hooks/useProgrammesModeles';

interface Props {
  participantId: string;
  onClose: () => void;
  onApplied: (nouveauProgrammeId: string) => void;
}

export default function AppliquerModeleModal({ participantId, onClose, onApplied }: Props) {
  const { modeles, loading, appliquerModele } = useProgrammesModeles();
  const [applying, setApplying] = useState<string | null>(null);

  async function handleApply(modeleId: string) {
    setApplying(modeleId);
    try {
      const nouveauProgrammeId = await appliquerModele(modeleId, participantId);
      if (nouveauProgrammeId) {
        toast.success('Modèle appliqué au bénéficiaire !');
        onApplied(nouveauProgrammeId);
      } else {
        toast.error("Erreur lors de l'application du modèle");
      }
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1200] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="font-semibold text-[15px] text-[#0D2B2B]">Utiliser un modèle</div>
          <button onClick={onClose} className="text-gray-400"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chargement…</div>
          ) : modeles.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Aucun modèle pour l'instant. Créez-en un depuis "Modèles" dans le menu.
            </div>
          ) : modeles.map(modele => {
            const totalEx = modele.seances.reduce((sum, s) => sum + s.exercices.length, 0);
            return (
              <div key={modele.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-gray-800">{modele.nom}</div>
                  <div className="text-[12px] text-gray-400">
                    {modele.seances.length} séance{modele.seances.length > 1 ? 's' : ''}
                    {totalEx > 0 && ` · ${totalEx} exercice${totalEx > 1 ? 's' : ''}`}
                  </div>
                </div>
                <button
                  onClick={() => handleApply(modele.id)}
                  disabled={applying !== null}
                  className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                  style={{ background: 'var(--color-teal)' }}
                >
                  {applying === modele.id ? 'Application…' : 'Utiliser'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
