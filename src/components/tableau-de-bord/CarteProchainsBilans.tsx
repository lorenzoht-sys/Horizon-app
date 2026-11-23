import { Link } from 'react-router-dom';
import type { Participant } from '../../types';
import type { BilanAPrevoir, EtatEcheance } from '../../lib/tableauDeBord';
import { Carte, Pastille, type TonPastille } from '../ui/Carte';

const TON: Record<EtatEcheance, TonPastille> = { retard: 'rouge', initial: 'orange', bientot: 'orange', a_jour: 'neutre' };
const AVATAR_COLORS = ['#2BB89A', '#1D9E9E', '#7D3C98', '#E67E22', '#C2187A', '#1A7F5A'];

export function CarteProchainsBilans({ bilans, participants }: { bilans: BilanAPrevoir[]; participants: Participant[] }) {
  return (
    <Carte
      id="titre-bilans"
      titre="Prochains bilans"
      aide="Un bilan tous les trois mois environ : c’est ce qui montre les progrès à la personne, à sa famille et à son médecin."
    >
      {bilans.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: '#3D4C5A' }}>Ajoutez un bénéficiaire : son bilan initial apparaîtra ici.</p>
      ) : (
        <ul className="list-none m-0 p-0">
          {bilans.map((b, i) => {
            const p = participants.find(x => x.id === b.participantId);
            if (!p) return null;
            return (
              <li key={b.participantId} style={{ borderTop: i === 0 ? 'none' : '1px solid #EEF4F4' }}>
                <Link to={`/participant/${p.id}`} className="flex items-center gap-2.5 py-2 rounded-lg hover:bg-gray-50 -mx-1 px-1">
                  <span className="w-8 h-8 rounded-full text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0"
                    style={{ background: AVATAR_COLORS[p.id.charCodeAt(0) % AVATAR_COLORS.length] }} aria-hidden="true">
                    {`${p.prenom[0] ?? ''}${p.nom[0] ?? ''}`.toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold truncate" style={{ color: 'var(--color-ink)' }}>{p.prenom} {p.nom}</span>
                    <span className="block text-xs" style={{ color: 'var(--color-ink-2)' }}>{b.type}</span>
                  </span>
                  <Pastille ton={TON[b.etat]}>{b.etat === 'initial' ? 'À faire' : b.libelle}</Pastille>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Carte>
  );
}
