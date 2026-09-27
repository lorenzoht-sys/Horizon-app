import { useState } from 'react';
import { ArrowLeft, Loader, ListChecks } from 'lucide-react';
import type { Seance } from '../../types';
import type { OptionPortee } from '../../lib/planificationManuelle';
import { formatDate } from '../../lib/agendaCommun';

// Option intermédiaire entre "cette séance uniquement" et "toutes les
// suivantes" : cocher précisément les occurrences concernées (ex : 2 dates de
// vacances sur une série de 12). Repliée par défaut derrière un 3e bouton
// pour ne pas alourdir le choix courant (déplacement simple, édition ponctuelle)
// — seul un praticien qui en a besoin l'ouvre.
function SelectionSeances({ futures, seanceRefId, loading, onConfirm, onRetour }: {
  futures: Seance[];
  seanceRefId: string;
  loading: boolean;
  onConfirm: (ids: string[]) => void;
  onRetour: () => void;
}) {
  const [selectionnees, setSelectionnees] = useState<Set<string>>(new Set([seanceRefId]));

  function toggle(id: string) {
    setSelectionnees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const nb = selectionnees.size;
  const datesTriees = futures.filter(f => selectionnees.has(f.id)).map(f => formatDate(f.date));

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onRetour} disabled={loading} className="text-gray-400 hover:text-gray-600 p-0.5 -ml-0.5">
          <ArrowLeft size={15} />
        </button>
        <h3 className="text-base font-bold text-dark">Sélectionner les séances concernées</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">Cochez précisément les occurrences à modifier.</p>

      <div className="space-y-1 max-h-56 overflow-y-auto border border-gray-100 rounded-xl p-2 mb-3">
        {futures.map(f => (
          <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
            <input type="checkbox" checked={selectionnees.has(f.id)} onChange={() => toggle(f.id)}
              className="w-3.5 h-3.5 accent-primary flex-shrink-0" />
            <span className="text-dark">{formatDate(f.date)} — {f.heureDebut}–{f.heureFin}</span>
          </label>
        ))}
      </div>

      <div className={`rounded-xl px-3 py-2.5 mb-4 ${nb === 0 ? 'bg-gray-50' : 'bg-primary/5 border border-primary/20'}`}>
        <p className={`text-xs font-semibold ${nb === 0 ? 'text-gray-400' : 'text-primary'}`}>
          {nb === 0 ? 'Aucune séance sélectionnée' : `${nb} séance${nb > 1 ? 's' : ''} sélectionnée${nb > 1 ? 's' : ''}`}
        </p>
        {nb > 0 && <p className="text-xs text-gray-500 mt-0.5">{datesTriees.join(', ')}</p>}
      </div>

      <button onClick={() => onConfirm(Array.from(selectionnees))} disabled={loading || nb === 0}
        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {loading
          ? <span className="inline-flex items-center gap-2 justify-center"><Loader size={13} className="animate-spin" />En cours…</span>
          : `Confirmer pour ${nb || 0} séance${nb > 1 ? 's' : ''}`}
      </button>
    </>
  );
}

// ── Choix de portée (occurrence seule vs série) — port de ModalChoixSerie
//    (PlanningGrilleView.tsx, non exportée) : aucun bouton présélectionné,
//    un déplacement/édition/suppression de masse doit rester un choix
//    conscient. ─────────────────────────────────────────────────────────────

export default function ModalChoixSerie({ titre, futures, seanceRefId, optionsDisponibles = ['unique', 'serie', 'selection'], avertissementSerie, loading, onUnique, onSerie, onSelection, onCancel }: {
  titre: string;
  futures: Seance[];
  seanceRefId: string;
  optionsDisponibles?: OptionPortee[];
  avertissementSerie?: string;
  loading: boolean;
  onUnique: () => void;
  onSerie: () => void;
  onSelection: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'choix' | 'selection'>('choix');
  const premiere = futures[0];
  const derniere = futures[futures.length - 1];
  const afficheSerie = optionsDisponibles.includes('serie');
  const afficheSelection = optionsDisponibles.includes('selection');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1030 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {mode === 'selection' ? (
          <SelectionSeances
            futures={futures}
            seanceRefId={seanceRefId}
            loading={loading}
            onConfirm={onSelection}
            onRetour={() => setMode('choix')}
          />
        ) : (
          <>
            <h3 className="text-base font-bold text-dark mb-1">{titre}</h3>
            <p className="text-xs text-gray-500 mb-4">
              Ce créneau se répète {futures.length} fois (du {formatDate(premiere.date)} au {formatDate(derniere.date)}). Quelle portée ?
            </p>
            {avertissementSerie && (
              <div className="bg-red-light border border-red/20 rounded-xl px-3 py-2.5 mb-4">
                <p className="text-xs font-semibold text-red">{avertissementSerie}</p>
              </div>
            )}
            <div className="space-y-2">
              <button onClick={onUnique} disabled={loading}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50">
                <span className="block">Cette séance uniquement</span>
                <span className="block text-xs font-normal opacity-80 mt-0.5">{formatDate(premiere.date)}</span>
              </button>
              {afficheSerie && (
                <button onClick={onSerie} disabled={loading}
                  className={`w-full py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
                    avertissementSerie ? 'border-red/30 text-red hover:bg-red-light' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}>
                  <span className="block">Cette séance et les {futures.length - 1} suivantes</span>
                  <span className="block text-xs font-normal opacity-80 mt-0.5">jusqu'au {formatDate(derniere.date)}</span>
                </button>
              )}
              {afficheSelection && (
                <button onClick={() => setMode('selection')} disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <ListChecks size={14} />
                  Sélectionner les séances concernées…
                </button>
              )}
              <button onClick={onCancel} disabled={loading}
                className="w-full py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600 transition-colors">
                {loading ? <span className="inline-flex items-center gap-2"><Loader size={13} className="animate-spin" />En cours…</span> : 'Annuler'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
