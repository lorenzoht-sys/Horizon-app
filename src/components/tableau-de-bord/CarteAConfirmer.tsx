import { Link } from 'react-router-dom';
import { Check, CheckCheck } from 'lucide-react';
import type { Participant, Seance } from '../../types';
import { LABEL_TYPE } from '../../lib/agendaCommun';
import { libelleRendezVous } from '../../lib/tableauDeBord';
import { Carte, Pastille } from '../ui/Carte';

// « Séances à confirmer » : séances passées encore « planifiées ». Elles n'entrent dans la facture
// qu'une fois marquées réalisées ; le bouton fait le geste ici, sans passer par l'agenda.
// Annuler ou déplacer reste dans l'agenda, qui demande le motif d'annulation.

const VISIBLES = 3;

export function CarteAConfirmer({ seances, participants, aujourdhui, enCours, onMarquerRealisee, onToutConfirmer }: {
  seances: Seance[];
  participants: Participant[];
  aujourdhui: string;
  /** Séance en cours d'enregistrement (bouton désactivé). */
  enCours: string | null;
  onMarquerRealisee: (s: Seance) => void;
  /** « Tout confirmer » (2026-11-24) : ouvre la confirmation détaillée, à partir de 2 séances. */
  onToutConfirmer?: () => void;
}) {
  const triees = [...seances].sort((a, b) => b.date.localeCompare(a.date) || b.heureDebut.localeCompare(a.heureDebut));
  const affichees = triees.slice(0, VISIBLES);
  return (
    <Carte
      id="titre-a-confirmer"
      titre="Séances à confirmer"
      badge={seances.length > 0 ? <Pastille ton="orange">{seances.length}</Pastille> : undefined}
      aide={seances.length > 0
        ? 'Un clic par séance, et votre facture du mois est juste. Une séance qui n’a pas eu lieu s’annule depuis l’agenda.'
        : undefined}
    >
      {seances.length === 0 ? (
        <p className="m-0 flex items-center gap-2 text-sm" style={{ color: '#147A64' }}>
          <Check size={16} aria-hidden="true" /> Tout est confirmé : vos factures sont à jour.
        </p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
          {affichees.map(s => {
            const p = participants.find(x => x.id === s.participantId);
            const nom = p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire';
            return (
              <li key={s.id} className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ border: '1px solid #EEF4F4' }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--color-ink)' }}>{nom}</div>
                  <div className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{libelleRendezVous(s, aujourdhui)} · {LABEL_TYPE[s.type]}</div>
                  {s.absenceSignaleeLe && (
                    <div className="text-xs font-semibold mt-1" style={{ color: '#8A5300' }}>Absence signalée par le bénéficiaire</div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onMarquerRealisee(s)}
                    disabled={enCours === s.id}
                    aria-label={`Marquer comme réalisée : ${nom}, ${libelleRendezVous(s, aujourdhui)}`}
                    className="flex-1 h-[38px] rounded-[10px] text-[13px] font-bold flex items-center justify-center gap-1.5 hover:brightness-95 disabled:opacity-60"
                    style={{ background: '#E6F5F1', color: '#147A64' }}
                  >
                    <Check size={15} aria-hidden="true" /> {enCours === s.id ? 'Enregistrement…' : 'Marquer comme réalisée'}
                  </button>
                  <Link to="/agenda-v2" className="h-[38px] px-3 rounded-[10px] text-[13px] font-bold flex items-center hover:bg-gray-50"
                    style={{ border: '1px solid #E2EEEE', color: 'var(--color-ink-2)' }}>
                    Agenda<span className="sr-only"> : annuler ou déplacer la séance de {nom}</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(seances.length > VISIBLES || (onToutConfirmer && seances.length >= 2)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {seances.length > VISIBLES ? (
            <Link to="/factures/seances" className="text-[13px] font-bold text-primary-dark hover:underline">
              Voir les {seances.length - VISIBLES} autres
            </Link>
          ) : <span />}
          {onToutConfirmer && seances.length >= 2 && (
            <button type="button" onClick={onToutConfirmer}
              className="h-[38px] px-3.5 rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 text-white hover:brightness-95"
              style={{ background: '#1A9A7F' }}>
              <CheckCheck size={15} aria-hidden="true" /> Tout confirmer ({seances.length})
            </button>
          )}
        </div>
      )}
    </Carte>
  );
}
