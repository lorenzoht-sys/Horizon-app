import { Link } from 'react-router-dom';
import type { Astuce } from '../../lib/tableauDeBord';

// « Le saviez-vous ? » : une astuce à la fois pour apprendre Horizon en s'en servant. « Plus tard »
// l'écarte pour de bon sur ce navigateur (voir astucesEcartees dans Dashboard.tsx).

export function CarteAstuce({ astuce, onEcarter }: { astuce: Astuce; onEcarter: () => void }) {
  return (
    <aside aria-labelledby="titre-astuce" className="rounded-[20px] flex flex-col gap-2.5"
      style={{ background: '#FFFBF2', border: '1px solid #F4E3C2', padding: '20px 22px' }}>
      <h2 id="titre-astuce" className="m-0 text-[13px] font-extrabold" style={{ color: '#8A5300' }}>Le saviez-vous ?</h2>
      <p className="m-0 text-sm leading-relaxed" style={{ color: 'var(--color-ink)' }}>{astuce.texte}</p>
      <div className="flex gap-3 items-center mt-auto">
        {astuce.lien.startsWith('/#')
          ? <a href={astuce.lien.slice(1)} className="text-[13px] font-bold text-primary-dark hover:underline">{astuce.action}</a>
          : <Link to={astuce.lien} className="text-[13px] font-bold text-primary-dark hover:underline">{astuce.action}</Link>}
        <button type="button" onClick={onEcarter} className="h-[34px] px-3 rounded-[9px] text-[13px] font-semibold hover:bg-white" style={{ color: 'var(--color-ink-2)' }}>
          Plus tard
        </button>
      </div>
    </aside>
  );
}
