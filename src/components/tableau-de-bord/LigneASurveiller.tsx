import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { regrouperASurveiller, type ElementATraiter } from '../../lib/tableauDeBord';

// « À surveiller » : une pastille par type de point (« 5 bilans commencés »), qui se déplie sur la
// liste des personnes concernées. Avant le 23/11/2026 : trois bandeaux de couleur empilés, puis
// une pastille par personne, qui prenait quatre lignes pour une vingtaine de bénéficiaires
// (retour de Lorenzo sur le compte de Pierre).

export function LigneASurveiller({ elements }: { elements: ElementATraiter[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const groupes = regrouperASurveiller(elements);
  if (groupes.length === 0) return null;
  const groupeOuvert = groupes.find(g => g.type === ouvert) ?? null;

  return (
    <section aria-labelledby="titre-surveiller" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="titre-surveiller" className="m-0 mr-1.5 text-[13px] font-extrabold" style={{ color: 'var(--color-ink-2)' }}>À surveiller</h2>
        {groupes.map(g => {
          const haute = g.gravite === 'haute';
          const estOuvert = ouvert === g.type;
          return (
            <button key={g.type} type="button" aria-expanded={estOuvert} aria-controls="detail-surveiller"
              onClick={() => setOuvert(estOuvert ? null : g.type)}
              className="inline-flex items-center gap-2 min-h-[34px] px-3 py-1 rounded-full bg-white text-[13px] font-semibold hover:shadow-sm"
              style={{ border: `1px solid ${haute ? 'rgba(232,84,74,0.4)' : 'rgba(240,164,41,0.5)'}`, color: 'var(--color-ink)', background: estOuvert ? '#FFFBF2' : '#FFFFFF' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: haute ? '#E8544A' : '#F0A429' }} aria-hidden="true" />
              {g.libelle}
              <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${estOuvert ? 'rotate-180' : ''}`} style={{ color: 'var(--color-ink-2)' }} />
            </button>
          );
        })}
      </div>
      {groupeOuvert && (
        <ul id="detail-surveiller" className="list-none m-0 p-2 bg-white rounded-[14px] grid gap-0.5"
          style={{ border: '1px solid #E2EEEE', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {groupeOuvert.elements.map(el => (
            <li key={el.cle}>
              <Link to={el.lien} className="flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] text-[13px] hover:bg-gray-50" style={{ color: 'var(--color-ink)' }}>
                <span className="min-w-0 truncate">{el.detail}</span>
                <span className="font-bold text-primary-dark whitespace-nowrap">{el.action}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
