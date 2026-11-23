import type { LucideIcon } from 'lucide-react';
import { AnimatedNumber } from '../ui/AnimatedNumber';

// Un chiffre du tableau de bord, avec sa ligne d'explication (demande de Lorenzo, 23/11/2026 :
// « bénéficiaires actifs, ça veut dire quoi ? ». Définitions : claude/onboarding.md, glossaire).

export function TuileChiffre({ icone: Icone, valeur, libelle, aide, alerte = false }: {
  icone: LucideIcon;
  valeur: number;
  libelle: string;
  aide: string;
  /** Mise en avant orange quand la valeur appelle une action (bilans à faire). */
  alerte?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-[18px]"
      style={{
        padding: '18px 20px',
        background: alerte ? '#FEF5E7' : '#FFFFFF',
        border: `1px solid ${alerte ? 'rgba(240,164,41,0.35)' : '#E2EEEE'}`,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: alerte ? 'rgba(240,164,41,0.16)' : 'var(--color-teal-light)' }}
        aria-hidden="true"
      >
        <Icone size={20} style={{ color: alerte ? '#C77D0A' : 'var(--color-teal)' }} />
      </span>
      <div className="min-w-0">
        <div className="font-heading font-extrabold leading-tight" style={{ fontSize: 26, color: alerte ? '#A8650A' : 'var(--color-ink)' }}>
          <AnimatedNumber value={valeur} duration={0.8} />
        </div>
        <div className="font-bold uppercase mt-0.5" style={{ fontSize: 12, letterSpacing: '0.5px', color: 'var(--color-ink-2)' }}>
          {libelle}
        </div>
        <div className="mt-0.5" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>{aide}</div>
      </div>
    </div>
  );
}
