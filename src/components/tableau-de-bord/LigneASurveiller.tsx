import { Link } from 'react-router-dom';
import type { ElementATraiter } from '../../lib/tableauDeBord';

// « À surveiller » : une ligne de pastilles sobres. Avant le 23/11/2026, ces points étaient trois
// bandeaux empilés (orange, ambre, rouge, en majuscules) qui passaient avant tout le reste.

export function LigneASurveiller({ elements }: { elements: ElementATraiter[] }) {
  if (elements.length === 0) return null;
  return (
    <section aria-labelledby="titre-surveiller" className="flex flex-wrap items-center gap-2">
      <h2 id="titre-surveiller" className="m-0 mr-1.5 text-[13px] font-extrabold" style={{ color: 'var(--color-ink-2)' }}>À surveiller</h2>
      {elements.map(el => {
        const haute = el.gravite === 'haute';
        return (
          <Link key={el.cle} to={el.lien}
            className="inline-flex items-center gap-2 min-h-[34px] px-3 py-1 rounded-full bg-white text-[13px] font-semibold hover:shadow-sm"
            style={{ border: `1px solid ${haute ? 'rgba(232,84,74,0.4)' : 'rgba(240,164,41,0.5)'}`, color: 'var(--color-ink)' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: haute ? '#E8544A' : '#F0A429' }} aria-hidden="true" />
            {el.titre} · {el.detail}
            <span className="sr-only"> : {el.action}</span>
          </Link>
        );
      })}
    </section>
  );
}
