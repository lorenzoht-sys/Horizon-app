import { useState, useMemo } from 'react';
import { X, Loader } from 'lucide-react';
import { format } from 'date-fns';
import type { Participant, Seance } from '../../types';
import { genererDatesSeances, datesManquantes, trouveChevauchements, addMinutes } from '../../utils/horaires';
import { CLE_JOUR_PAR_DOW, formatDate, type DropPendant } from '../../lib/agendaCommun';

// ── Confirmation de création (équivalent de ModalConfirmDrop, non exporté
//    depuis PlanningGrilleView.tsx — nouvelle implémentation, même logique
//    d'appel : genererDatesSeances, datesManquantes, trouveChevauchements) ──

export default function ModalConfirmerCreation({ info, seances, participantMap, onConfirm, onCancel }: {
  info: DropPendant;
  seances: Seance[];
  participantMap: Map<string, Participant>;
  onConfirm: (heureDebut: string, duree: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { participant, contrat, date } = info;
  const [heureDebut, setHeureDebut] = useState(format(date, 'HH:mm'));
  const [duree, setDuree] = useState(contrat.dureeMinutes);
  const [loading, setLoading] = useState(false);

  const heureFin = addMinutes(heureDebut, duree);
  const jourKey = CLE_JOUR_PAR_DOW[date.getDay()];
  const dateDebutStr = format(date, 'yyyy-MM-dd');

  // Même génération que creerDatesRecurrentes (PlanningGrilleView.tsx), mais
  // ancrée sur la vraie date déposée plutôt que sur "aujourd'hui" — un
  // agenda daté connaît la date exacte visée, pas seulement "le jeudi".
  const datesGenerees = useMemo(
    () => genererDatesSeances(dateDebutStr, contrat.dateFin, jourKey, contrat.periodicite ?? 'semaine', contrat.dateDebut),
    [dateDebutStr, contrat, jourKey],
  );
  const dates = useMemo(
    () => datesManquantes(seances, participant.id, contrat.id, datesGenerees),
    [seances, participant.id, contrat.id, datesGenerees],
  );

  const conflits = useMemo(
    () => trouveChevauchements(seances, dates.map(d => ({ date: d, heureDebut, heureFin }))),
    [seances, dates, heureDebut, heureFin],
  );

  async function handleConfirmer() {
    if (conflits.length > 0 || dates.length === 0) return;
    setLoading(true);
    try {
      await onConfirm(heureDebut, duree);
    } catch {
      // Déjà signalé par un toast (message humain, voir messageErreurSeance
      // dans useAgenda) — on absorbe juste l'exception pour ne pas la
      // laisser remonter en rejet non géré ; la modale reste ouverte.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Planifier la séance</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
            <p className="text-sm font-semibold text-dark">{participant.prenom} {participant.nom}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Jour (chaque semaine)</p>
              <p className="text-sm font-semibold text-dark">
                {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Heure de début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
              <p className="text-xs text-gray-400 mt-0.5">→ fin {heureFin}</p>
            </div>
          </div>

          {contrat.dureesSeances.length > 1 ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {contrat.dureesSeances.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Durée : <span className="font-medium text-dark">{duree} min</span></p>
          )}

          {dates.length > 0 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-primary">{dates.length} séance{dates.length > 1 ? 's' : ''}</span>
                {' '}à créer sur la durée du contrat
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(dates[0])} → {formatDate(dates[dates.length - 1])}
              </p>
              {datesGenerees.length > dates.length && (
                <p className="text-xs text-gray-400 mt-0.5">
                  ({datesGenerees.length - dates.length} déjà existante{datesGenerees.length - dates.length > 1 ? 's' : ''} pour ce contrat, ignorée{datesGenerees.length - dates.length > 1 ? 's' : ''})
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              {datesGenerees.length === 0
                ? 'Aucune date disponible dans ce contrat.'
                : `${participant.prenom} a déjà une séance planifiée à chacune de ces dates pour ce contrat.`}
            </p>
          )}

          {conflits.length > 0 && (() => {
            const premier = conflits[0];
            const nomExistant = participantMap.get(premier.existante.participantId);
            const nomAffiche = nomExistant ? `${nomExistant.prenom} ${nomExistant.nom[0]}.` : 'un autre bénéficiaire';
            return (
              <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-red">
                  Créneau indisponible — chevauche une séance existante avec {nomAffiche} le {formatDate(premier.creneau.date)} ({premier.existante.heureDebut}–{premier.existante.heureFin}).
                </p>
                <p className="text-xs text-red mt-1">Modifiez l'heure ou la durée pour lever le conflit.</p>
              </div>
            );
          })()}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleConfirmer} disabled={loading || dates.length === 0 || conflits.length > 0}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              dates.length === 0 || conflits.length > 0 ? 'bg-red text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-dark'
            }`}>
            {loading
              ? <><Loader size={14} className="animate-spin" />En cours…</>
              : conflits.length > 0
                ? 'Créneau occupé'
                : dates.length === 0
                  ? 'Rien à créer'
                  : `Confirmer (${dates.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
