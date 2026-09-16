import type { ReactNode } from 'react';

// Carte d'erreur pleine page du portail bénéficiaire — extraite de
// ErrorBoundaryPatient.tsx pour être réutilisée par EspacePatient.tsx sur un
// échec qui n'est PAS une erreur de rendu (une promesse rejetée dans un
// useEffect ne remonte jamais à une error boundary React, voir le
// commentaire en tête d'ErrorBoundaryPatient.tsx). Même JSX, même style :
// c'est le seul écran de secours que le bénéficiaire doit apprendre à
// reconnaître, qu'il vienne d'un plantage au rendu ou d'un chargement raté.

const C = {
  bg: '#F4F9F9',
  carte: '#FFFFFF',
  bord: '#E0EEEE',
  encre: '#1A3A3A',
  discret: '#8FA8A8',
  accent: '#0F766E',
};

interface Props {
  titre: string;
  messagePrincipal: ReactNode;
  messageSecondaire: ReactNode;
  /** Affiché replié — le bénéficiaire n'a pas à le lire, mais c'est la seule
   *  information utile à lire à voix haute à son praticien au téléphone. */
  detailTechnique?: string;
  onReessayer: () => void;
}

export default function CarteErreurPatient({
  titre, messagePrincipal, messageSecondaire, detailTechnique, onReessayer,
}: Props) {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100dvh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          background: C.carte,
          border: `1px solid ${C.bord}`,
          borderRadius: 18,
          padding: '32px 24px',
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 2px 16px rgba(15, 118, 110, 0.06)',
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 16 }} aria-hidden="true">
          🌿
        </div>

        <h1 style={{ fontSize: 19, fontWeight: 700, color: C.encre, margin: '0 0 12px' }}>
          {titre}
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.encre, margin: '0 0 8px' }}>
          {messagePrincipal}
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.discret, margin: '0 0 24px' }}>
          {messageSecondaire}
        </p>

        <button
          type="button"
          onClick={onReessayer}
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: 16,
            fontWeight: 600,
            color: C.carte,
            background: C.accent,
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>

        {detailTechnique && (
          <details style={{ marginTop: 20, textAlign: 'left' }}>
            <summary style={{ fontSize: 13, color: C.discret, cursor: 'pointer' }}>
              Détail technique
            </summary>
            <pre
              style={{
                marginTop: 10,
                padding: 12,
                background: C.bg,
                border: `1px solid ${C.bord}`,
                borderRadius: 10,
                fontSize: 12,
                color: C.encre,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {detailTechnique}
              {'\n'}
              {window.location.origin}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
