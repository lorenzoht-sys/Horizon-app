import { useState, useMemo } from 'react';
import { X, Loader, Trash2, Undo2, Check, NotebookPen } from 'lucide-react';
import { format, addDays } from 'date-fns';
import type { Seance, StatutSeance, Contrat, RaisonAnnulation } from '../../types';
import { addMinutes, trouveChevauchement } from '../../utils/horaires';
import { calculerFutures, type MiseAJourSeance } from '../../lib/planificationManuelle';
import { formatDate, LABEL_STATUT, OPTIONS_RAISON_ANNULATION, LABEL_RAISON_ANNULATION } from '../../lib/agendaCommun';

// ── Édition / suppression d'une séance existante (étape 3) — remplace la
//    popup lecture seule de l'étape 2. Port de ModalEditSeance
//    (PlanningGrilleView.tsx), sans le volet disponibilités/organisation :
//    non demandé ici, périmètre propre à cet écran-là. ──────────────────────

export default function ModalEditSeance({ seance, nomBeneficiaire, seances, contrat, onSave, onDelete, onRestaurer, onReporter, onNoteSeance, onClose }: {
  seance: Seance;
  nomBeneficiaire: string;
  seances: Seance[];
  contrat: Contrat | null;
  onSave: (updates: MiseAJourSeance) => void;
  onDelete: () => void;
  onRestaurer: () => void;
  // Toujours "cette occurrence seule", jamais de choix série (voir
  // handleReporterSeance côté page principale) — reproduit exactement le
  // comportement de ModalReporter (AgendaPage.tsx), qui n'a jamais eu de
  // notion de série.
  onReporter: (nouvelleDate: string) => Promise<void>;
  onNoteSeance: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(seance.date);
  const [heureDebut, setHeureDebut] = useState(seance.heureDebut);
  const [duree, setDuree] = useState(seance.dureeMinutes);
  const [statut, setStatut] = useState<StatutSeance>(seance.statut);
  const [raisonAnnulation, setRaisonAnnulation] = useState<RaisonAnnulation | ''>(seance.motifAnnulation ?? '');
  const [raisonAnnulationDetail, setRaisonAnnulationDetail] = useState(seance.motifAnnulationDetail ?? '');
  const [confirmSuppr, setConfirmSuppr] = useState(false);
  // "Reportée" ne passe pas par handleEnregistrer (qui ne fait que modifier
  // les champs de LA séance existante) : reporter crée une nouvelle séance à
  // la nouvelle date et marque celle-ci "reportee", sans y toucher sinon —
  // d'où un sous-écran dédié plutôt qu'une simple valeur du sélecteur Statut.
  // Bouton d'accès retiré de la section Statut (demande explicite) : le
  // sous-écran et handleReporterSeance restent en place intacts, seule
  // l'entrée UI est coupée — d'où pas de setter ici, `etapeReport` reste
  // toujours false tant qu'aucun bouton ne le déclenche.
  const [etapeReport] = useState(false);
  const [dateReport, setDateReport] = useState(() => format(addDays(new Date(seance.date), 7), 'yyyy-MM-dd'));
  const [loadingReport, setLoadingReport] = useState(false);

  const heureFin = addMinutes(heureDebut, duree);

  // Occurrences futures (celle-ci incluse) du même créneau récurrent — le
  // périmètre exact que « cette séance et les suivantes » modifierait.
  const futures = useMemo(() => calculerFutures(seances, seance), [seances, seance]);

  const conflit = useMemo(
    () => trouveChevauchement(seances, { date, heureDebut, heureFin }, seance.id),
    [seances, date, heureDebut, heureFin, seance.id],
  );

  function handleEnregistrer() {
    if (conflit) return;
    // La raison n'a de sens que pour une annulation — jamais transmise pour
    // un autre statut, pour ne pas laisser traîner une ancienne raison si la
    // séance est réannulée plus tard sous un motif différent (ou aucun).
    const motifAnnulation = statut === 'annulee' && raisonAnnulation ? raisonAnnulation : undefined;
    const motifAnnulationDetail = motifAnnulation === 'autre' ? raisonAnnulationDetail.trim() || undefined : undefined;
    onSave({ date, heureDebut, heureFin, dureeMinutes: duree, statut, motifAnnulation, motifAnnulationDetail });
    onClose();
  }

  function handleSupprimer() {
    onDelete();
    onClose();
  }

  async function handleConfirmerReport() {
    setLoadingReport(true);
    try {
      await onReporter(dateReport);
      onClose();
    } finally {
      setLoadingReport(false);
    }
  }

  // Raccourci "↩ Restaurer" — toujours en portée "cette séance uniquement",
  // jamais de choix série : contourne structurellement le bug corrigé dans
  // trouverSerieRecurrente (une référence annulée s'excluait elle-même de sa
  // propre série), et évite au passage de faire deviner à l'utilisateur
  // qu'il doit re-sélectionner "Planifiée" dans le sélecteur de statut.
  function handleRestaurer() {
    onRestaurer();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">{etapeReport ? 'Reporter la séance' : 'Modifier la séance'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        {etapeReport ? (
          <div className="px-6 py-4 space-y-4">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
              <p className="text-sm font-semibold text-dark">{nomBeneficiaire}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nouvelle date</label>
              <input type="date" value={dateReport} onChange={e => setDateReport(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
              <p className="text-xs text-gray-400 mt-1">Suggestion : semaine suivante au même créneau ({seance.heureDebut})</p>
            </div>
            <p className="text-xs text-blue-700 bg-blue-50 rounded-xl px-4 py-3">
              {formatDate(seance.date)} {seance.heureDebut}–{seance.heureFin} sera marquée « Reportée ». Une nouvelle séance planifiée sera créée le {formatDate(dateReport)} au même horaire, avec une note indiquant l'origine du report.
            </p>
          </div>
        ) : (
        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
            <p className="text-sm font-semibold text-dark">{nomBeneficiaire}</p>
          </div>

          {seance.statut === 'annulee' && (
            <div className="flex items-center justify-between gap-3 bg-amber-light border border-amber/20 rounded-xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber">
                  Séance annulée{seance.motifAnnulation ? ` — ${LABEL_RAISON_ANNULATION[seance.motifAnnulation]}` : ''}
                </p>
                {seance.motifAnnulationDetail && (
                  <p className="text-xs text-amber mt-0.5 truncate">{seance.motifAnnulationDetail}</p>
                )}
              </div>
              <button onClick={handleRestaurer}
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white bg-amber hover:opacity-90 rounded-lg px-3 py-2 transition-colors">
                <Undo2 size={13} />
                Restaurer
              </button>
            </div>
          )}

          {futures.length > 1 && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded-xl px-4 py-3">
              Ce créneau se répète encore {futures.length} fois (jusqu'au {formatDate(futures[futures.length - 1].date)}). La portée (cette séance seule ou toute la série) sera demandée à l'enregistrement.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Heure de début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
              <p className="text-xs text-gray-400 mt-0.5">→ fin {heureFin}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
            {contrat && contrat.dureesSeances.length > 1 ? (
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {contrat.dureesSeances.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            ) : (
              <input type="number" min={5} step={5} value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Statut</label>
            <div className="grid grid-cols-3 gap-2">
              {(['planifiee', 'realisee', 'annulee'] as StatutSeance[]).map(s => (
                <button key={s} onClick={() => setStatut(s)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors text-left ${
                    statut === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                  }`}>
                  {LABEL_STATUT[s]}
                </button>
              ))}
            </div>
          </div>

          {statut === 'annulee' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Raison de l'annulation <span className="normal-case font-normal text-gray-400">(facultatif, usage interne)</span>
              </label>
              <select value={raisonAnnulation} onChange={e => setRaisonAnnulation(e.target.value as RaisonAnnulation | '')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                <option value="">— Non précisée —</option>
                {OPTIONS_RAISON_ANNULATION.map(r => <option key={r} value={r}>{LABEL_RAISON_ANNULATION[r]}</option>)}
              </select>
              {raisonAnnulation === 'autre' && (
                <input type="text" value={raisonAnnulationDetail} onChange={e => setRaisonAnnulationDetail(e.target.value)}
                  placeholder="Précisez la raison…" maxLength={200}
                  className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              )}
              {futures.length > 1 && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Si vous sélectionnez plusieurs séances à l'enregistrement, cette même raison s'appliquera à toutes celles cochées.
                </p>
              )}
            </div>
          )}

          {conflit && (
            <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red">
                Créneau indisponible — chevauche une autre séance ({conflit.heureDebut}–{conflit.heureFin}) le {formatDate(conflit.date)}.
              </p>
              <p className="text-xs text-red mt-1">Modifiez l'heure, la date ou la durée pour lever le conflit.</p>
            </div>
          )}
        </div>
        )}

        {etapeReport ? (
          // Bloc actuellement inatteignable (etapeReport est figé à false,
          // voir plus haut) — laissé en place avec le reste du sous-écran de
          // report, pour ne pas supprimer handleReporterSeance en profondeur.
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={onClose} disabled={loadingReport}
              className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              Retour
            </button>
            <button onClick={handleConfirmerReport} disabled={loadingReport}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loadingReport
                ? <><Loader size={14} className="animate-spin" />En cours…</>
                : <><Check size={14} />Confirmer le report</>}
            </button>
          </div>
        ) : (
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-wrap">
            <button onClick={() => setConfirmSuppr(true)}
              className="flex items-center justify-center border border-red/20 text-red rounded-xl px-3 hover:bg-red-light transition-colors">
              <Trash2 size={15} />
            </button>
            <button onClick={onNoteSeance}
              className="flex items-center justify-center gap-1.5 border border-secondary/30 text-secondary bg-secondary/10 rounded-xl px-3 hover:bg-secondary/20 transition-colors text-xs font-medium">
              <NotebookPen size={13} />
              Note
            </button>
            <button onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button onClick={handleEnregistrer} disabled={!!conflit}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                conflit ? 'bg-red text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-dark'
              }`}>
              {conflit ? 'Créneau occupé' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      {confirmSuppr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1020 }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <p className="text-sm text-dark font-medium mb-1">Supprimer cette séance ?</p>
            <p className="text-xs text-gray-500 mb-4">
              {nomBeneficiaire} — {formatDate(seance.date)} {seance.heureDebut}–{seance.heureFin}. Action irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSuppr(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={handleSupprimer}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red text-white hover:opacity-90">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
