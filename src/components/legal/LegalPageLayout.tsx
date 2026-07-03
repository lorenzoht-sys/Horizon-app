import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  children: ReactNode;
}

// Mise en page commune aux pages légales publiques (politique de
// confidentialité, mentions légales) — accessibles sans authentification.
export default function LegalPageLayout({ title, children }: Props) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg, #edf1ee)',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: '40px 20px 80px',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: '#0d9488',
            textDecoration: 'none',
            marginBottom: 24,
          }}
        >
          ← Retour à Horizon
        </Link>

        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: '40px 44px',
            boxShadow: '0 12px 48px rgba(15,46,42,0.08)',
          }}
        >
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#0f2e2a',
              letterSpacing: '-0.5px',
              marginBottom: 8,
            }}
          >
            {title}
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 32 }}>
            Dernière mise à jour : [À COMPLÉTER]
          </p>

          <div
            style={{
              fontSize: 14.5,
              lineHeight: 1.7,
              color: '#334155',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} style={{ marginBottom: 28, scrollMarginTop: 24 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: '#0f2e2a',
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid #eef2f0',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        background: '#FFF7E6',
        color: '#B45309',
        borderRadius: 4,
        padding: '1px 6px',
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      {children}
    </span>
  );
}
