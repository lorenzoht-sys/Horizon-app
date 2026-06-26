import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useContrats } from '../../hooks/useContrats';
import { useAgenda } from '../../hooks/useAgenda';
import { useParticipants } from '../../hooks/useParticipants';
import { Plus, PauseCircle, XCircle, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Contrat } from '../../types';
import ModalGenerationContrat from './ModalGenerationContrat';
import { getAuthHeader } from '../../lib/supabase';

const STATUT_BADGE: Record<string, { label: string; class: string }> = {
  actif:    { label: 'Actif',    class: 'bg-green-100 text-green-700' },
  termine:  { label: 'Terminé', class: 'bg-gray-100 text-gray-500' },
  suspendu: { label: 'Suspendu', class: 'bg-orange-100 text-orange-700' },
  a_venir:  { label: 'À venir',  class: 'bg-blue-100 text-blue-700' },
};

function labelFrequence(contrat: Contrat): string {
  if (contrat.periodicite === 'deux_semaines') return '1 séance toutes les 2 semaines';
  if (contrat.periodicite === 'trois_semaines') return '1 séance toutes les 3 semaines';
  return `${contrat.nbSeancesSemaine} séance${contrat.nbSeancesSemaine > 1 ? 's' : ''}/semaine`;
}

interface Props {
  participantId: string;
}

export default function ContratsTab({ participantId }: Props) {
  const { contratsDeParticipant, modifierStatut, toggleExclureTournee, supprimerContrat } = useContrats();
  const { seances } = useAgenda();
  const { participants } = useParticipants();
  const [modalPDF, setModalPDF] = useState<Contrat | null>(null);
  const [confirmSuppr, setConfirmSuppr] = useState<{ contratId: string; nbSeances: number } | null>(null);
  const [supprimant, setSupprimant] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const participant = participants.find(p => p.id === participantId);

  const contrats = contratsDeParticipant(participantId);

  function seancesContrat(contratId: string) {
    return seances.filter(s => s.contratId === contratId);
  }

  function prochaineSeance(contrat: Contrat): string | null {
    const prochaine = seances
      .filter(s => s.contratId === contrat.id && s.statut === 'planifiee' && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!prochaine) return null;
    return new Date(prochaine.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function handleSuspendre(contratId: string) {
    if (!confirm('Suspendre ce contrat ? Les séances futures restent dans l\'agenda.')) return;
    modifierStatut(contratId, 'suspendu');
    toast.success('Contrat suspendu');
  }

  function handleTerminer(contratId: string) {
    if (!confirm('Terminer ce contrat ?')) return;
    modifierStatut(contratId, 'termine');
    toast.success('Contrat terminé');
  }

  function handleReactiver(contratId: string) {
    modifierStatut(contratId, 'actif');
    toast.success('Contrat réactivé');
  }

  function handleToggleExclureTournee(contratId: string, exclureTournee: boolean) {
    toggleExclureTournee(contratId, exclureTournee);
    toast.success(exclureTournee
      ? 'Exclu de l\'optimisation de tournée'
      : 'Réintégré dans l\'optimisation de tournée');
  }

  function handleSupprimer(contratId: string) {
    const nbFutures = seances.filter(
      s => s.contratId === contratId && s.statut === 'planifiee' && s.date >= today
    ).length;
    if (nbFutures === 0) {
      supprimerContrat(contratId);
      toast.success('Contrat supprimé');
      return;
    }
    setConfirmSuppr({ contratId, nbSeances: nbFutures });
  }

  async function handleSupprimerAvecSeances() {
    if (!confirmSuppr) return;
    setSupprimant(true);
    try {
      const authHeader = await getAuthHeader();
      const r = await fetch('/api/seances/supprimer-planifiees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ contratIds: [confirmSuppr.contratId], dateMin: today }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw new Error(detail.error ?? 'Erreur suppression séances');
      }
      supprimerContrat(confirmSuppr.contratId);
      toast.success('Contrat et séances futures supprimés');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setSupprimant(false);
      setConfirmSuppr(null);
    }
  }

  function handleSupprimerSansSeances() {
    if (!confirmSuppr) return;
    supprimerContrat(confirmSuppr.contratId);
    toast.success('Contrat supprimé (séances conservées)');
    setConfirmSuppr(null);
  }

  if (contrats.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm text-gray-400 mb-4">Aucun contrat de suivi</p>
        <Link
          to={`/participant/${participantId}/contrat/nouveau`}
          className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
        >
          <Plus size={15} />
          Créer le premier contrat
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-heading font-semibold text-dark text-sm uppercase tracking-wide">Contrats de suivi</h2>
        <Link
          to={`/participant/${participantId}/contrat/nouveau`}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-dark transition-colors"
        >
          <Plus size={13} />
          Nouveau contrat
        </Link>
      </div>

      {contrats.map(contrat => {
        const ss = seancesContrat(contrat.id);
        // Prend le max entre les séances réalisées dans l'agenda et le compteur du contrat
        // (le contrat stocke l'historique des séances antérieures à la démo)
        const realiseesDansAgenda = ss.filter(s => s.statut === 'realisee').length;
        const realisees = Math.max(realiseesDansAgenda, contrat.nombreSeancesRealisees);
        const total = contrat.nombreSeancesTotal;
        const pct = total > 0 ? Math.round((realisees / total) * 100) : 0;
        const badge = STATUT_BADGE[contrat.statut] ?? STATUT_BADGE.actif;
        const prochaine = prochaineSeance(contrat);

        return (
          <div key={contrat.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.class}`}>
                    {badge.label}
                  </span>
                  {contrat.exclureTournee && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500"
                      title="Ce contrat n'est jamais candidaté par le planificateur de tournée"
                    >
                      Hors tournée
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-dark">
                  {new Date(contrat.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  {' → '}
                  {new Date(contrat.dateFin + 'T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {labelFrequence(contrat)}
                  {' · '}{contrat.heureDebut} · {contrat.dureeMinutes} min
                </div>
              </div>
              <button
                onClick={() => handleSupprimer(contrat.id)}
                className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                title="Supprimer"
              >
                <XCircle size={16} />
              </button>
            </div>

            {/* Barre de progression */}
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>{realisees} / {total} séances réalisées</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: contrat.statut === 'termine' ? '#3B6D11' : '#1A5F9E' }}
                />
              </div>
            </div>

            {prochaine && contrat.statut === 'actif' && (
              <div className="text-xs text-gray-500 mb-3">
                Prochain RDV : <span className="font-medium text-dark">{prochaine}</span>
              </div>
            )}

            {contrat.notes && (
              <div className="text-xs text-gray-400 italic mb-3">{contrat.notes}</div>
            )}

            {(contrat.statut === 'actif' || contrat.statut === 'a_venir') && (
              <label className="flex items-center gap-2 cursor-pointer select-none mb-3">
                <input
                  type="checkbox"
                  checked={!!contrat.exclureTournee}
                  onChange={e => handleToggleExclureTournee(contrat.id, e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary"
                />
                <span className="text-xs text-gray-500">Ne pas inclure dans l'optimisation de tournée</span>
              </label>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {(contrat.statut === 'actif' || contrat.statut === 'a_venir') && participant && (
                <button
                  onClick={() => setModalPDF(contrat)}
                  className="flex items-center gap-1.5 text-xs border border-primary text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors font-medium"
                >
                  <FileText size={12} />
                  PDF
                </button>
              )}
              {contrat.statut === 'actif' && (
                <>
                  <button
                    onClick={() => handleSuspendre(contrat.id)}
                    className="flex items-center gap-1.5 text-xs border border-orange-200 text-orange-600 px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <PauseCircle size={12} />
                    Suspendre
                  </button>
                  <button
                    onClick={() => handleTerminer(contrat.id)}
                    className="flex items-center gap-1.5 text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <XCircle size={12} />
                    Terminer
                  </button>
                  <Link
                    to={`/participant/${participantId}/contrat/nouveau`}
                    className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <RefreshCw size={12} />
                    Renouveler
                  </Link>
                </>
              )}
              {contrat.statut === 'suspendu' && (
                <button
                  onClick={() => handleReactiver(contrat.id)}
                  className="flex items-center gap-1.5 text-xs border border-green-200 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors"
                >
                  <RefreshCw size={12} />
                  Réactiver
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal génération PDF */}
      {modalPDF && participant && (
        <ModalGenerationContrat
          contrat={modalPDF}
          participant={participant}
          onClose={() => setModalPDF(null)}
        />
      )}

      {/* Dialog confirmation suppression avec séances */}
      {confirmSuppr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1001 }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-dark">Supprimer ce contrat ?</h3>
            <p className="text-sm text-gray-600">
              Ce contrat a{' '}
              <span className="font-semibold text-dark">
                {confirmSuppr.nbSeances} séance{confirmSuppr.nbSeances > 1 ? 's' : ''} planifiée{confirmSuppr.nbSeances > 1 ? 's' : ''}
              </span>{' '}
              à venir. Voulez-vous les supprimer également ?
            </p>
            <div className="space-y-2">
              <button
                onClick={handleSupprimerAvecSeances}
                disabled={supprimant}
                className="w-full py-2.5 bg-danger text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {supprimant ? 'Suppression…' : 'Supprimer le contrat et les séances futures'}
              </button>
              <button
                onClick={handleSupprimerSansSeances}
                disabled={supprimant}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Supprimer uniquement le contrat
              </button>
              <button
                onClick={() => setConfirmSuppr(null)}
                disabled={supprimant}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
