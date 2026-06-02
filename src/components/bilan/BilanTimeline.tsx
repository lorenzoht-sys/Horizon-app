import { Link } from 'react-router-dom';
import type { Bilan } from '../../types';
import { Calendar, ChevronRight } from 'lucide-react';

interface Props {
  bilans: Bilan[];
  participantId: string;
}

function getKeyScores(bilan: Bilan): { label: string; value: string }[] {
  const scores: { label: string; value: string }[] = [];
  if (bilan.tug3m != null)                    scores.push({ label: 'TUG',  value: `${bilan.tug3m}s` });
  if (bilan.chairStand30 != null)             scores.push({ label: 'CS',   value: `${bilan.chairStand30} rép.` });
  if (bilan.handGrip?.droite != null)         scores.push({ label: 'Grip', value: `${bilan.handGrip.droite} kg` });
  if (bilan.tm6?.distanceMetres != null)      scores.push({ label: 'TM6',  value: `${bilan.tm6.distanceMetres} m` });
  if (bilan.equilibre?.droite != null)        scores.push({ label: 'Équil.', value: `${bilan.equilibre.droite}s` });
  if (bilan.memoire?.scoreImmediat != null)   scores.push({ label: 'Mém.', value: `${bilan.memoire.scoreImmediat}/5` });
  return scores.slice(0, 4);
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
    <div>
      {sorted.map((bilan, i) => {
        const scores = getKeyScores(bilan);
        const isLast = i === sorted.length - 1;
        return (
          <div key={bilan.id} className="flex gap-3">
            {/* Colonne timeline */}
            <div className="flex flex-col items-center flex-shrink-0 pt-1">
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${bilan.type === 'initial' ? 'bg-primary' : 'bg-secondary'}`}
              />
              {!isLast && <div className="w-0.5 bg-gray-200 flex-1 my-1 min-h-[24px]" />}
            </div>

            {/* Contenu */}
            <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : ''}`}>
              <Link
                to={`/participant/${participantId}/bilan/${bilan.id}`}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all group"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                  bilan.type === 'initial' ? 'bg-primary text-white' : 'bg-secondary/20 text-secondary'
                }`}>
                  {bilan.type === 'initial' ? 'I' : `T${bilan.trimestre}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-dark text-sm">
                      {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
                    </span>
                    {i === 0 && (
                      <span className="text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">
                        Dernier
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                    <Calendar size={10} />
                    {new Date(bilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  {scores.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {scores.map(s => (
                        <span key={s.label} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                          {s.label} {s.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-primary transition-colors flex-shrink-0" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
