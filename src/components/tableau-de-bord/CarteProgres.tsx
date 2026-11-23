import { Link } from 'react-router-dom';
import type { Participant } from '../../types';
import type { Progres } from '../../lib/tableauDeBord';
import { Carte } from '../ui/Carte';

// « Les progrès de vos bénéficiaires » : ce qui donne envie. Placé avant les points à surveiller,
// pour que le travail accompli se voie dès l'accueil. Seuls des progrès nets sont montrés
// (progresDepuisInitial) ; les reculs restent visibles sur la fiche.

export function CarteProgres({ progres }: { progres: { participant: Participant; progres: Progres }[] }) {
  return (
    <Carte
      id="titre-progres"
      titre="Les progrès de vos bénéficiaires"
      action={<span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>depuis leur bilan initial</span>}
      aide={progres.length > 0 ? 'Le fruit de votre travail : à partager avec eux à la prochaine séance.' : undefined}
    >
      {progres.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: '#3D4C5A' }}>
          Les progrès apparaîtront ici dès le deuxième bilan d’un bénéficiaire : Horizon compare chaque test au bilan initial.
        </p>
      ) : (
        <ul className="list-none m-0 p-0 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {progres.map(({ participant: p, progres: g }) => (
            <li key={p.id}>
              <Link to={`/participant/${p.id}/comparaison`} className="h-full rounded-[14px] px-3.5 py-3 flex flex-col gap-1 hover:brightness-[0.98]" style={{ background: '#F5F9FB', color: 'var(--color-ink)' }}>
                <span className="text-[13px] font-bold">{p.prenom} {p.nom}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-extrabold" style={{ color: '#147A64' }}>{g.delta}</span>
                  <span className="text-xs" style={{ color: '#3D4C5A' }}>{g.test}</span>
                </span>
                <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>{g.sens}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}
