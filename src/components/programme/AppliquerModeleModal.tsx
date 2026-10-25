import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useProgrammesModeles } from '../../hooks/useProgrammesModeles';
import CatalogueModelesMouvApa from './CatalogueModelesMouvApa';
import { MODELES_MOUVAPA, versDonneesModele, type ModeleMouvApa } from '../../data/modelesMouvApa';
import { EXERCICES_BASE } from '../../data/exercices';

interface Props {
  participantId: string;
  onClose: () => void;
  onApplied: (nouveauProgrammeId: string) => void;
}

export default function AppliquerModeleModal({ participantId, onClose, onApplied }: Props) {
  const { modeles, loading, appliquerModele, createModele } = useProgrammesModeles();
  const [applying, setApplying] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<'mes' | 'mouvapa'>('mes');

  // Modèle Mouv'APA : copie dans « Mes modèles », puis application par le mécanisme habituel
  // (dupliquer_programme_modele). Le programme créé est indépendant du modèle et du catalogue.
  async function handleUtiliserMouvApa(modele: ModeleMouvApa) {
    const copieId = await createModele(versDonneesModele(modele, EXERCICES_BASE));
    if (!copieId) { toast.error('Impossible de préparer ce modèle. Réessayez.'); return; }
    await handleApply(copieId);
  }

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
      <div className={`bg-white rounded-2xl w-full ${onglet === 'mouvapa' ? 'max-w-[760px]' : 'max-w-[480px]'} max-h-[85vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="font-semibold text-[15px] text-[#0D2B2B]">Utiliser un modèle</div>
          <button onClick={onClose} className="text-gray-400"><X size={18} /></button>
        </div>
        <div className="flex gap-1 border-b border-gray-100 px-4 flex-shrink-0" role="tablist">
          {([['mes', 'Mes modèles'], ['mouvapa', `Modèles Horizon (${MODELES_MOUVAPA.length})`]] as const).map(([id, libelle]) => (
            <button key={id} role="tab" aria-selected={onglet === id} onClick={() => setOnglet(id)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px ${onglet === id ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>
              {libelle}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {onglet === 'mouvapa' ? (
            <CatalogueModelesMouvApa libelleAction="Utiliser" onAction={handleUtiliserMouvApa} />
          ) : loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Chargement…</div>
          ) : modeles.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Aucun modèle pour l'instant. Choisissez un modèle Horizon (onglet ci-dessus) ou créez-en un depuis « Modèles ».
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
