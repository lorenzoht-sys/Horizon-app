import { Check } from 'lucide-react';

// En-tête d'étapes commun au formulaire bénéficiaire et au bilan (charte
// graphique, 25/11/2026). Avant, chaque stepper avait le sien : pastilles vert
// #27AE60 pour les étapes faites (2,9:1 avec le blanc), libellés en gris clair
// masqués sur téléphone. Ici : étape en cours pleine en vert d'action, étapes
// faites cochées, libellé de l'étape courante toujours écrit.

export function EtapesFormulaire({ etapes, courante, onAller }: {
  etapes: string[];
  courante: number;
  /** Permet de revenir à une étape déjà vue en cliquant dessus (facultatif). */
  onAller?: (i: number) => void;
}) {
  return (
    <nav aria-label="Étapes" className="mb-6">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {etapes.map((libelle, i) => {
          const faite = i < courante;
          const enCours = i === courante;
          const cliquable = Boolean(onAller) && i !== courante;
          return (
            <li key={libelle} className="flex-1 min-w-0">
              <button
                type="button"
                disabled={!cliquable}
                onClick={() => onAller?.(i)}
                aria-current={enCours ? 'step' : undefined}
                className="w-full flex flex-col gap-1.5 text-left disabled:cursor-default group"
              >
                <span className="block h-1.5 rounded-full transition-colors"
                  style={{ background: faite || enCours ? 'var(--vert-action)' : 'var(--trait)' }} />
                <span className="hidden sm:flex items-center gap-1 text-xs font-semibold truncate"
                  style={{ color: enCours ? 'var(--encre)' : 'var(--encre-2)' }}>
                  {faite && <Check size={12} aria-hidden="true" style={{ color: 'var(--vert-action)' }} />}
                  <span className={`truncate ${cliquable ? 'group-hover:underline underline-offset-2' : ''}`}>{libelle}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="sm:hidden mt-2 text-xs font-semibold" style={{ color: 'var(--encre-2)' }}>
        Étape {courante + 1} sur {etapes.length} : <span style={{ color: 'var(--encre)' }}>{etapes[courante]}</span>
      </p>
    </nav>
  );
}
