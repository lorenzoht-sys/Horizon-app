import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import type { Participant, Seance } from '../../types';
import { LABEL_TYPE } from '../../lib/agendaCommun';

// « Aujourd'hui » du tableau de bord. Avant la refonte (23/11/2026), ce bloc était en bas de
// page, sous toute la liste des bénéficiaires : il fallait défiler pour voir sa journée.

type Etat = 'realisee' | 'en_cours' | 'a_confirmer' | 'a_venir';

const PASTILLE: Record<Etat, { libelle: string; fond: string; texte: string }> = {
  realisee:    { libelle: 'Réalisée',    fond: '#E6F5F1', texte: '#147A64' },
  en_cours:    { libelle: 'En cours',    fond: '#2BB89A', texte: '#FFFFFF' },
  a_confirmer: { libelle: 'À confirmer', fond: '#FEF5E7', texte: '#A8650A' },
  a_venir:     { libelle: 'À venir',     fond: '#F5F9FB', texte: '#5A6B7A' },
};

function etatDe(s: Seance, maintenant: string): Etat {
  if (s.statut === 'realisee') return 'realisee';
  if (s.heureFin.slice(0, 5) <= maintenant) return 'a_confirmer';
  if (s.heureDebut.slice(0, 5) <= maintenant) return 'en_cours';
  return 'a_venir';
}

const AVATAR_COLORS = ['#2BB89A', '#1D9E9E', '#7D3C98', '#E67E22', '#C2187A', '#1A7F5A'];

export function CarteAujourdhui({ seances, participants, maintenant, nbARelancer }: {
  /** Séances du jour, non annulées, triées par heure. */
  seances: Seance[];
  participants: Participant[];
  /** « HH:MM ». */
  maintenant: string;
  /** Bénéficiaires sans séance depuis plus de 3 semaines. */
  nbARelancer: number;
}) {
  const faites = seances.filter(s => s.statut === 'realisee').length;

  return (
    <section aria-labelledby="titre-aujourdhui" className="bg-white rounded-[18px] flex flex-col"
      style={{ border: '1px solid #E2EEEE', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex justify-between items-center mb-2 gap-3">
        <h2 id="titre-aujourdhui" className="m-0 font-heading font-bold text-base flex items-center gap-2">
          <CalendarDays size={18} className="text-primary" aria-hidden="true" />
          Aujourd’hui
          <span className="font-semibold text-sm" style={{ color: 'var(--color-ink-2)' }}>
            · {seances.length} séance{seances.length !== 1 ? 's' : ''}{seances.length > 0 ? `, ${faites} faite${faites !== 1 ? 's' : ''}` : ''}
          </span>
        </h2>
        <Link to="/agenda-v2" className="text-[13px] font-bold text-primary-dark hover:underline flex items-center gap-0.5 whitespace-nowrap">
          Voir l’agenda <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {seances.length === 0 ? (
        <p className="m-0 py-6 text-sm text-center" style={{ color: 'var(--color-ink-2)' }}>Aucune séance planifiée aujourd’hui.</p>
      ) : (
        <ol className="list-none m-0 p-0">
          {seances.map(s => {
            const p = participants.find(x => x.id === s.participantId);
            const etat = etatDe(s, maintenant);
            const pastille = PASTILLE[etat];
            const nom = p ? `${p.prenom} ${p.nom}` : 'Bénéficiaire';
            const detail = [s.type !== 'seance' ? LABEL_TYPE[s.type] : 'Séance', p?.adresseVille].filter(Boolean).join(' · ');
            return (
              <li key={s.id} className="border-t" style={{ borderColor: '#EEF4F4' }}>
                <Link to={p ? `/participant/${p.id}` : '/agenda-v2'} className="flex items-center gap-3.5 py-2.5 rounded-lg hover:bg-gray-50 -mx-1 px-1">
                  <span className="w-[52px] font-extrabold text-[15px]" style={{ color: etat === 'realisee' ? '#9DAFC0' : 'var(--color-ink)' }}>
                    {s.heureDebut.slice(0, 5)}
                  </span>
                  <span className="w-9 h-9 rounded-full text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0"
                    style={{ background: AVATAR_COLORS[(p?.id.charCodeAt(0) ?? 0) % AVATAR_COLORS.length] }} aria-hidden="true">
                    {p ? `${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase() : '?'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-dark truncate">{nom}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--color-ink-2)' }}>{detail}</span>
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: pastille.fond, color: pastille.texte }}>
                    {pastille.libelle}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {nbARelancer > 0 && (
        <p className="m-0 mt-auto pt-3 text-xs font-semibold" style={{ color: '#A8650A' }}>
          {nbARelancer} bénéficiaire{nbARelancer > 1 ? 's' : ''} sans séance depuis plus de 3 semaines.
        </p>
      )}
    </section>
  );
}
