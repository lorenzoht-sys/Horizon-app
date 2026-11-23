import type { ReactNode } from 'react';

// Briques communes du tableau de bord V1 (23/11/2026). Avant, chaque page réécrivait ses classes
// de carte et de pastille : rayons de 12 à 20 px, gris de texte trop clairs. Ces deux composants
// fixent la charte validée (rayon 20, bordure #E2EEEE, aide en #5A6B7A) ; le portail structure
// s'en servira aussi.

export type TonPastille = 'vert' | 'orange' | 'rouge' | 'neutre' | 'plein';

const TONS: Record<TonPastille, { fond: string; texte: string }> = {
  vert:   { fond: '#E6F5F1', texte: '#147A64' },
  orange: { fond: '#FEF5E7', texte: '#8A5300' },
  rouge:  { fond: '#FEF0EF', texte: '#B42318' },
  neutre: { fond: '#F2F6F8', texte: '#3D4C5A' },
  plein:  { fond: '#1A9A7F', texte: '#FFFFFF' },
};

/** Pastille d'état : le mot est toujours écrit, la couleur ne fait que l'appuyer. */
export function Pastille({ ton, children }: { ton: TonPastille; children: ReactNode }) {
  const t = TONS[ton];
  return (
    <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: t.fond, color: t.texte }}>
      {children}
    </span>
  );
}

/** Carte de section : titre, une phrase qui dit à quoi elle sert, et une action à droite. */
export function Carte({ id, titre, aide, action, badge, children, className = '' }: {
  id: string;
  titre: ReactNode;
  /** Une phrase simple : à quoi sert ce bloc (pédagogie voulue par Lorenzo). */
  aide?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`bg-white rounded-[20px] flex flex-col gap-3 ${className}`}
      style={{ border: '1px solid #E2EEEE', padding: '20px 22px' }}>
      <div className="flex justify-between items-center gap-3">
        <h2 id={id} className="m-0 font-heading font-extrabold text-base flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
          {titre}{badge}
        </h2>
        {action}
      </div>
      {aide && <p className="m-0 text-xs leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>{aide}</p>}
      {children}
    </section>
  );
}
