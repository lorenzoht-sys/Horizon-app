import { useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import { FileText, Calendar, Repeat, CalendarRange, Clock } from 'lucide-react';
import BadgeSeancesRestantes from '../../components/ui/BadgeSeancesRestantes';
import { calculerStatutSeancesSemaine } from '../../utils/horaires';
import type { Participant, Contrat, Seance } from '../../types';
import { SectionLabel } from './communs';

function formatDateCourt(date: string): string {
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
    <div className="bg-white rounded-[18px] p-4 sm:p-5 shadow-sm" style={{ border: '1px solid #E2EEEE' }}>
      <SectionLabel>Suivi en cours</SectionLabel>

      {contratActif ? (
        <>
          {contratActif.dureeIndeterminee ? (
            <div className="text-[13px] text-gray-500 mb-3">
              Suivi actif depuis {new Date(contratActif.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · sans date de fin
            </div>
          ) : (
            <>
              {/* Anneau de progression (refonte du 23/11/2026) à la place de la fine barre :
                  le nombre de séances faites se lit d'un coup d'œil. */}
              {(() => {
                const total = Math.max(1, contratActif.nombreSeancesTotal);
                const ratio = Math.min(1, contratActif.nombreSeancesRealisees / total);
                const r = 26, c = 2 * Math.PI * r;
                return (
                  <div className="flex items-center gap-4 mb-3">
                    <svg width="64" height="64" viewBox="0 0 64 64" role="img"
                      aria-label={`${contratActif.nombreSeancesRealisees} séances réalisées sur ${contratActif.nombreSeancesTotal}`}>
                      <circle cx="32" cy="32" r={r} fill="none" stroke="#E6EEF0" strokeWidth="7" />
                      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-teal)" strokeWidth="7"
                        strokeLinecap="round" strokeDasharray={`${c * ratio} ${c}`} transform="rotate(-90 32 32)" />
                      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1A2332">{Math.round(ratio * 100)}%</text>
                    </svg>
                    <div>
                      <div className="text-[20px] font-extrabold text-gray-900 leading-none">
                        {contratActif.nombreSeancesRealisees}<span className="text-[14px] text-gray-400 font-bold"> / {contratActif.nombreSeancesTotal}</span>
                      </div>
                      <div className="text-[12px] text-gray-500 mt-1">séances réalisées</div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
          <div className="space-y-1 text-[13px] text-gray-500">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Repeat size={13} className="text-gray-400" aria-hidden="true" />
              <span>{contratActif.nbSeancesSemaine} séance{contratActif.nbSeancesSemaine > 1 ? 's' : ''}/semaine · {contratActif.heureDebut} · {contratActif.dureeMinutes} min</span>
              <BadgeSeancesRestantes statut={statutSeances} />
            </div>
            <div className="flex items-center gap-1.5"><CalendarRange size={13} className="text-gray-400" aria-hidden="true" />{new Date(contratActif.dateDebut + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })} → {new Date(contratActif.dateFin + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>
          </div>

          {prochaineSeance && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full" style={{ background: '#E6F8F8', color: '#1A9999' }}>
              <Calendar size={11} />
              Prochain RDV : {formatDateCourt(prochaineSeance.date)} · {prochaineSeance.heureDebut}
            </div>
          )}

          {joursAvantFin !== null && joursAvantFin <= 14 && joursAvantFin >= 0 && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: '#FFF7E6', color: '#B45309' }}>
              <Clock size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />Contrat se termine dans {joursAvantFin} jour{joursAvantFin > 1 ? 's' : ''}
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
