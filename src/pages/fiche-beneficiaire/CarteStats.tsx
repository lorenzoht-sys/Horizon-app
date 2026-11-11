import { useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import { FileText, Calendar } from 'lucide-react';
import BadgeSeancesRestantes from '../../components/ui/BadgeSeancesRestantes';
import { calculerStatutSeancesSemaine } from '../../utils/horaires';
import type { Participant, Contrat, Seance } from '../../types';
import { SectionLabel } from './communs';

export function formatDateCourt(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ── CarteStats ────────────────────────────────────────────────────────────────

export function CarteStats({ participant, contratActif, prochaineSeance, seances }: {
  participant: Participant;
  contratActif: Contrat | null;
  prochaineSeance: Seance | null;
  seances: Seance[];
}) {
  const navigate = useNavigate();
  const joursAvantFin = contratActif
    ? differenceInDays(new Date(contratActif.dateFin), new Date()) : null;
  const statutSeances = calculerStatutSeancesSemaine(contratActif, seances);

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <SectionLabel>Suivi en cours</SectionLabel>

      {contratActif ? (
        <>
          {contratActif.dureeIndeterminee ? (
            <div className="text-[13px] text-gray-500 mb-3">
              Suivi actif depuis {new Date(contratActif.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · sans date de fin
            </div>
          ) : (
            <>
              <div className="flex justify-between text-[13px] text-gray-500 mb-1.5">
                <span>Séances réalisées</span>
                <span className="font-semibold text-gray-800">
                  {contratActif.nombreSeancesRealisees} / {contratActif.nombreSeancesTotal}
                </span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((contratActif.nombreSeancesRealisees / contratActif.nombreSeancesTotal) * 100))}%`,
                    background: 'var(--color-teal)',
                  }}
                />
              </div>
            </>
          )}
          <div className="space-y-1 text-[13px] text-gray-500">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>📅 {contratActif.nbSeancesSemaine} séance{contratActif.nbSeancesSemaine > 1 ? 's' : ''}/semaine · {contratActif.heureDebut} · {contratActif.dureeMinutes} min</span>
              <BadgeSeancesRestantes statut={statutSeances} />
            </div>
            <div>📆 {new Date(contratActif.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })} → {new Date(contratActif.dateFin + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
          </div>

          {prochaineSeance && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full" style={{ background: '#E6F8F8', color: '#1A9999' }}>
              <Calendar size={11} />
              Prochain RDV : {formatDateCourt(prochaineSeance.date)} · {prochaineSeance.heureDebut}
            </div>
          )}

          {joursAvantFin !== null && joursAvantFin <= 14 && joursAvantFin >= 0 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: '#FFF7E6', color: '#B45309' }}>
              ⏰ Contrat se termine dans {joursAvantFin} jour{joursAvantFin > 1 ? 's' : ''}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-5 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <FileText size={18} className="text-gray-400" />
          </div>
          <p className="text-[13px] text-gray-600 font-medium mb-1">Aucun contrat actif</p>
          <p className="text-[12px] text-gray-400 mb-3">Créez un contrat pour commencer le suivi</p>
          <button
            onClick={() => navigate(`/participant/${participant.id}/contrat/nouveau`)}
            className="inline-flex items-center gap-1.5 border text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors hover:bg-teal-50"
            style={{ borderColor: 'var(--color-teal)', color: 'var(--color-teal)' }}
          >
            + Créer un contrat
          </button>
        </div>
      )}
    </div>
  );
}
