import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Participant, Seance } from '../../types';
import { LABEL_TYPE } from '../../lib/agendaCommun';
import { Carte, Pastille, type TonPastille } from '../ui/Carte';

// « Aujourd'hui » : la journée dans l'ordre, avec l'état de chaque rendez-vous en toutes lettres.

type Etat = 'realisee' | 'en_cours' | 'a_confirmer' | 'prochaine' | 'a_venir';

const PASTILLE: Record<Etat, { libelle: string; ton: TonPastille; point: string }> = {
  realisee:    { libelle: 'Réalisée',    ton: 'vert',   point: '#2BB89A' },
  en_cours:    { libelle: 'En cours',    ton: 'plein',  point: '#1A9A7F' },
  a_confirmer: { libelle: 'À confirmer', ton: 'orange', point: '#F0A429' },
  prochaine:   { libelle: 'Prochaine',   ton: 'plein',  point: '#1A9A7F' },
  a_venir:     { libelle: 'À venir',     ton: 'neutre', point: '#C9D3DC' },
};

function etatDe(s: Seance, maintenant: string, prochaineId: string | null): Etat {
  if (s.statut === 'realisee') return 'realisee';
  if (s.heureFin.slice(0, 5) <= maintenant) return 'a_confirmer';
  if (s.heureDebut.slice(0, 5) <= maintenant) return 'en_cours';
  return s.id === prochaineId ? 'prochaine' : 'a_venir';
}

export function CarteJournee({ seances, participants, maintenant, prochaineId }: {
  /** Séances du jour, non annulées, triées par heure. */
  seances: Seance[];
  participants: Participant[];
  maintenant: string;
  prochaineId: string | null;
}) {
  const faites = seances.filter(s => s.statut === 'realisee').length;
  return (
    <Carte
      id="titre-journee"
      titre="Aujourd’hui"
      badge={seances.length > 0 ? <span className="text-sm font-semibold" style={{ color: 'var(--color-ink-2)' }}>· {seances.length} rendez-vous, {faites} fait{faites > 1 ? 's' : ''}</span> : undefined}
      action={<Link to="/agenda-v2" className="text-[13px] font-bold text-primary-dark hover:underline flex items-center gap-0.5 whitespace-nowrap">Ouvrir l’agenda <ChevronRight size={14} aria-hidden="true" /></Link>}
    >
      {seances.length === 0 ? (
        <p className="m-0 py-6 text-sm text-center" style={{ color: '#3D4C5A' }}>
          Aucun rendez-vous aujourd’hui : un bon moment pour préparer les bilans de la semaine.
        </p>
      ) : (
        <ol className="list-none m-0 p-0">
          {seances.map((s, i) => {
            const p = participants.find(x => x.id === s.participantId);
            const etat = etatDe(s, maintenant, prochaineId);
            const pastille = PASTILLE[etat];
            const detail = [LABEL_TYPE[s.type], p?.adresseVille].filter(Boolean).join(' · ');
            return (
              <li key={s.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #EEF4F4' }}>
                <Link to={p ? `/participant/${p.id}` : '/agenda-v2'} className="grid items-center gap-3 py-2.5 rounded-lg hover:bg-gray-50 -mx-1 px-1"
                  style={{ gridTemplateColumns: '52px 14px minmax(0,1fr) auto' }}>
                  <span className="font-extrabold text-sm" style={{ color: etat === 'prochaine' ? '#1A9A7F' : etat === 'a_venir' ? 'var(--color-ink)' : 'var(--color-ink-2)' }}>
                    {s.heureDebut.slice(0, 5)}
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: pastille.point, boxShadow: `0 0 0 3px ${pastille.point}22` }} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold truncate" style={{ color: 'var(--color-ink)' }}>{p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire'}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--color-ink-2)' }}>{detail}</span>
                  </span>
                  <Pastille ton={pastille.ton}>{pastille.libelle}</Pastille>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Carte>
  );
}
