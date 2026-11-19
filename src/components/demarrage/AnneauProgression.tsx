import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  faites: number;
  total: number;
  taille?: number;
  epaisseur?: number;
  /** Sur fond sombre (en-tête mobile) : piste claire, texte blanc. */
  surFondSombre?: boolean;
}

export function AnneauProgression({ faites, total, taille = 72, epaisseur = 7, surFondSombre = false }: Props) {
  const reduit = useReducedMotion();
  const rayon = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * rayon;
  const ratio = total === 0 ? 1 : faites / total;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={faites}
      aria-label={`${faites} étape${faites > 1 ? 's' : ''} sur ${total}`}
      className="relative flex-shrink-0"
      style={{ width: taille, height: taille }}
    >
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={taille / 2} cy={taille / 2} r={rayon} fill="none"
          stroke={surFondSombre ? 'rgba(255,255,255,0.14)' : 'var(--color-teal-light)'}
          strokeWidth={epaisseur}
        />
        <motion.circle
          cx={taille / 2} cy={taille / 2} r={rayon} fill="none"
          stroke="var(--color-teal)" strokeWidth={epaisseur} strokeLinecap="round"
          strokeDasharray={circonference}
          initial={{ strokeDashoffset: reduit ? circonference * (1 - ratio) : circonference }}
          animate={{ strokeDashoffset: circonference * (1 - ratio) }}
          transition={{ duration: reduit ? 0 : 0.9, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span
          className="font-heading font-bold tabular-nums"
          style={{ fontSize: taille * 0.25, color: surFondSombre ? '#FFFFFF' : 'var(--color-ink)', letterSpacing: '-0.02em' }}
        >
          {faites}
          <span style={{ fontSize: taille * 0.17, color: surFondSombre ? 'rgba(255,255,255,0.55)' : 'var(--color-ink-3)', fontWeight: 600 }}>/{total}</span>
        </span>
      </div>
    </div>
  );
}
