import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Bilan } from '../../types';
import { Calendar, ChevronRight, Pencil, Trash2 } from 'lucide-react';

interface Props {
  bilans: Bilan[];
  participantId: string;
  onDelete?: (bilanId: string) => void;
}

function getKeyScores(bilan: Bilan): { label: string; value: string }[] {
  const scores: { label: string; value: string }[] = [];
  if (bilan.tug3m != null)                    scores.push({ label: 'TUG',    value: `${bilan.tug3m}s` });
  if (bilan.chairStand30 != null)             scores.push({ label: 'CS',     value: `${bilan.chairStand30} rép.` });
  if (bilan.handGrip?.droite != null)         scores.push({ label: 'Grip',   value: `${bilan.handGrip.droite} kg` });
  if (bilan.tm6?.distanceMetres != null)      scores.push({ label: 'TM6',    value: `${bilan.tm6.distanceMetres} m` });
  if (bilan.equilibre?.droite != null)        scores.push({ label: 'Équil.', value: `${bilan.equilibre.droite}s` });
  if (bilan.memoire?.scoreImmediat != null)   scores.push({ label: 'Mém.',   value: `${bilan.memoire.scoreImmediat}/5` });
  return scores.slice(0, 4);
}

export default function BilanTimeline({ bilans, participantId, onDelete }: Props) {
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${bilan.type === 'initial' ? 'bg-primary' : 'bg-secondary'}`} />
              {!isLast && <div className="w-0.5 bg-gray-200 flex-1 my-1 min-h-[24px]" />}
            </div>

            {/* Contenu */}
            <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : ''}`}>
              <div className="flex items-start gap-2 p-3 bg-white rounded-xl border border-gray-100 hover:border-primary/20 transition-colors group">
                {/* Badge type */}
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
                      <span className="text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">Dernier</span>
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

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link
                    to={`/participant/${participantId}/bilan/${bilan.id}`}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                  >
                    Voir <ChevronRight size={12} />
                  </Link>
                  <button
                    onClick={() => navigate(`/participant/${participantId}/bilan/${bilan.id}/edit`)}
                    title="Modifier ce bilan"
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => setConfirmDeleteId(bilan.id)}
                      title="Supprimer ce bilan"
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Modal de confirmation de suppression */}
              {confirmDeleteId === bilan.id && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">⚠️ Supprimer ce bilan ?</p>
                  <p className="text-xs text-red-600 mb-3">Cette action est irréversible. Toutes les données de ce bilan seront perdues.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onDelete!(bilan.id); setConfirmDeleteId(null); }}
                      className="flex-1 bg-red-500 text-white text-xs font-semibold py-2 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Supprimer définitivement
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 border border-gray-200 text-gray-600 text-xs font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
