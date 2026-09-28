import { useNavigate } from 'react-router-dom';
import { Building2, Settings } from 'lucide-react';
import type { Structure } from '../../types';

export const TYPE_LABELS: Record<string, string> = {
  ehpad: 'EHPAD', centre: 'Centre de soins', association: 'Association',
  entreprise: 'Entreprise', autre: 'Autre',
};

export default function CarteStructure({ structure, nbPatients, derniereSeance }: {
  structure: Structure;
  nbPatients: number;
  derniereSeance?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} style={{ color: 'var(--color-teal)' }} />
          </div>
          <div>
            <div className="font-heading font-semibold text-dark text-sm">{structure.nom}</div>
            {structure.type && <div className="text-xs text-gray-400">{TYPE_LABELS[structure.type] ?? structure.type}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-primary">{nbPatients}</div>
          <div className="text-xs text-gray-400">bénéficiaire{nbPatients !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {structure.contactNom && (
        <div className="text-xs text-gray-500 mb-1">Contact : {structure.contactNom}</div>
      )}
      {derniereSeance && (
        <div className="text-xs text-gray-400 mb-3">
          Dernière séance : {new Date(derniereSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => navigate(`/structures/${structure.id}`, { state: { structure } })}
          className="flex-1 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors text-center"
        >
          Voir les bénéficiaires →
        </button>
        <button
          onClick={() => navigate(`/structures/${structure.id}`, { state: { structure } })}
          className="text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 px-2.5 py-2 rounded-lg transition-colors"
          title="Gérer la structure"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
}
