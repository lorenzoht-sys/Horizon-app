import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, ClipboardList, FileText, HeartPulse, CalendarClock, type LucideIcon } from 'lucide-react';
import type { ElementATraiter, TypeATraiter } from '../../lib/tableauDeBord';

// « À traiter » : une seule liste au lieu des bandeaux orange, ambre et rouge empilés avant la
// refonte du 23/11/2026. Construite par elementsATraiter (src/lib/tableauDeBord.ts).

const ICONE: Record<TypeATraiter, LucideIcon> = {
  seances: CheckCheck,
  ressentis: HeartPulse,
  brouillon: ClipboardList,
  contrat: FileText,
  contrat_jours: CalendarClock,
};

const VISIBLES = 5;

export function CarteATraiter({ elements }: { elements: ElementATraiter[] }) {
  const [tout, setTout] = useState(false);
  const affiches = tout ? elements : elements.slice(0, VISIBLES);

  return (
    <section aria-labelledby="titre-a-traiter" className="bg-white rounded-[18px]"
      style={{ border: '1px solid #E2EEEE', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex justify-between items-center mb-2">
        <h2 id="titre-a-traiter" className="m-0 font-heading font-bold text-base">À traiter</h2>
        {elements.length > 0 && (
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full" style={{ background: '#FEF5E7', color: '#A8650A' }}>
            {elements.length}
          </span>
        )}
      </div>

      {elements.length === 0 ? (
        <p className="m-0 py-6 text-sm text-center" style={{ color: 'var(--color-ink-2)' }}>Rien à traiter pour l’instant.</p>
      ) : (
        <ul className="list-none m-0 p-0">
          {affiches.map(el => {
            const Icone = ICONE[el.type];
            const haute = el.gravite === 'haute';
            return (
              <li key={el.cle} className="flex gap-3 items-center py-2.5 border-t" style={{ borderColor: '#EEF4F4' }}>
                <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: haute ? '#FEF0EF' : '#FEF5E7' }} aria-hidden="true">
                  <Icone size={16} style={{ color: haute ? '#D0453B' : '#C77D0A' }} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{el.titre}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--color-ink-2)' }}>{el.detail}</span>
                </span>
                <Link to={el.lien} className="text-[13px] font-bold text-primary-dark hover:underline whitespace-nowrap">
                  {el.action}
                  <span className="sr-only"> : {el.detail}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {elements.length > VISIBLES && (
        <button type="button" onClick={() => setTout(t => !t)} className="mt-2 text-[13px] font-bold text-primary-dark hover:underline">
          {tout ? 'Réduire' : `Voir les ${elements.length - VISIBLES} autres`}
        </button>
      )}
    </section>
  );
}
