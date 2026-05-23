import { Link } from 'react-router-dom';
import type { Bilan } from '../../types';
import { Calendar, ChevronRight } from 'lucide-react';

interface Props {
  bilans: Bilan[];
  participantId: string;
}

export default function BilanTimeline({ bilans, participantId }: Props) {
  const sorted = [...bilans].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Calendar size={48} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">Aucun bilan enregistré</p>
        <p className="text-sm">Commencez par créer le bilan initial</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((bilan, i) => (
        <Link
          key={bilan.id}
          to={`/participant/${participantId}/bilan/${bilan.id}`}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all group"
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
            bilan.type === 'initial' ? 'bg-primary text-white' : 'bg-secondary/20 text-secondary'
          }`}>
            {bilan.type === 'initial' ? 'I' : `T${bilan.trimestre}`}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-dark text-sm">
              {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <Calendar size={11} />
              {new Date(bilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          {i === 0 && (
            <span className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full font-medium">
              Dernier
            </span>
          )}
          <ChevronRight size={16} className="text-gray-300 group-hover:text-primary transition-colors" />
        </Link>
      ))}
    </div>
  );
}
