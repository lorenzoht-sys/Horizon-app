import { Link } from 'react-router-dom';

interface Props {
  /** 'dark' = fond sombre (sidebar), 'light' = fond clair (login, portails publics) */
  variant?: 'dark' | 'light';
  style?: React.CSSProperties;
}

// Liens RGPD affichés en pied de page — praticien (sidebar) et pages publiques
// (login, inscription, portail bénéficiaire/structure).
export default function LegalFooterLinks({ variant = 'light', style }: Props) {
  const color = variant === 'dark' ? 'rgba(255,255,255,0.35)' : '#94a3b8';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 11,
        color,
        ...style,
      }}
    >
      <Link to="/politique-confidentialite" style={{ color, textDecoration: 'none' }}>
        Confidentialité
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/mentions-legales" style={{ color, textDecoration: 'none' }}>
        Mentions légales
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/cgu" style={{ color, textDecoration: 'none' }}>
        CGU
      </Link>
    </div>
  );
}
