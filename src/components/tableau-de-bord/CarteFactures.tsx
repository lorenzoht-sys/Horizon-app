import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { ResumeFactures } from '../../lib/tableauDeBord';
import { Carte } from '../ui/Carte';

// « Factures en attente » : lecture seule. Le détail et toutes les actions (valider, envoyer,
// marquer payée) restent dans les pages Factures ; ce bloc ne modifie rien.

export function CarteFactures({ resume, chargement }: { resume: ResumeFactures; chargement: boolean }) {
  const lignes = [
    { cle: 'valider', n: resume.aValider, titre: 'À valider', detail: 'Préparées à partir de vos séances réalisées', lien: '/factures/a-valider', fond: '#F5F9FB', couleur: '#147A64' },
    { cle: 'retard', n: resume.enRetard, titre: 'En retard de paiement', detail: 'Échéance dépassée', lien: '/factures', fond: '#FEF0EF', couleur: '#B42318' },
    { cle: 'attente', n: resume.nonReglees, titre: 'Envoyées, pas encore réglées', detail: 'Échéance à venir', lien: '/factures', fond: '#F5F9FB', couleur: '#3D4C5A' },
  ].filter(l => l.n > 0);
  return (
    <Carte
      id="titre-factures"
      titre="Factures en attente"
      action={<Link to="/factures" className="text-[13px] font-bold text-primary-dark hover:underline whitespace-nowrap">Factures →</Link>}
      aide="Un coup d’œil suffit : le détail et les actions restent dans la page Factures."
    >
      {chargement ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-12 rounded-[14px] animate-pulse" style={{ background: '#EEF4F4' }} />
          <div className="h-12 rounded-[14px] animate-pulse" style={{ background: '#F5F9FB' }} />
        </div>
      ) : lignes.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: '#3D4C5A' }}>Rien en attente. Les factures se préparent seules à partir des séances que vous confirmez.</p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {lignes.map(l => (
            <li key={l.cle}>
              <Link to={l.lien} className="flex items-center gap-3 p-3 rounded-[14px] hover:brightness-[0.98]" style={{ background: l.fond, color: 'var(--color-ink)' }}>
                <span className="text-[22px] font-extrabold min-w-[26px]" style={{ color: l.couleur }}>{l.n}</span>
                <span className="flex-1">
                  <span className="block text-sm font-bold">{l.titre}</span>
                  <span className="block text-xs" style={{ color: 'var(--color-ink-2)' }}>{l.detail}</span>
                </span>
                <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--color-ink-2)' }} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}
