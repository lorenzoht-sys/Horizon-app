import { Component, type ReactNode, type ErrorInfo } from 'react';

// Filet de sécurité du portail bénéficiaire.
//
// ── Pourquoi il existe ──────────────────────────────────────────────────
// Écrit le 2026-09-03, après l'incident du 29/08 : le domaine
// `app.horizon-suivi.fr` a été ajouté au projet Vercel, `*.vercel.app` s'est
// mis à rediriger vers lui en 307, et les bénéficiaires dont le service
// worker était déjà enregistré sur l'ancienne origine ont vu leurs appels
// API partir en cross-origin. Le navigateur retire `Authorization` sur une
// redirection cross-origin, la réponse 401 n'a pas d'en-tête CORS, `fetch`
// échoue en `ERR_FAILED` — et l'écran est resté BLANC.
//
// Un bénéficiaire devant un écran blanc n'a aucun recours : il ne lit pas
// la console, il ne sait pas recharger sans le cache, et il ne fait pas ses
// exercices. Le défaut à corriger n'est pas la redirection — c'est qu'un
// plantage ait pu être MUET sur son écran.
//
// ── Ce que cette limite attrape, et ce qu'elle n'attrape pas ────────────
// React ne remonte à une frontière d'erreur que ce qui est levé pendant le
// RENDU, dans un constructeur ou dans une méthode de cycle de vie. Une
// promesse rejetée dans un `useEffect` — typiquement `void charger()` dans
// `EspacePatient.tsx`, qui n'a pas de `.catch()` — ne passe PAS par ici :
// elle laisse l'écran sur son état de chargement, sans exception.
//
// Autrement dit : cette limite couvre l'écran blanc, pas l'écran figé. Le
// `.catch()` manquant est un correctif distinct, tracké à part — ne pas
// croire que ce fichier l'a réglé.
//
// ── Pas de dépendance à Sentry ─────────────────────────────────────────
// `src/lib/sentry.ts` n'expose que `initSentry()`, et Sentry n'est actif
// qu'en production. On journalise donc en console : si Sentry tourne, il
// capte déjà l'erreur non interceptée par son propre hook global. Ajouter
// un import conditionnel ici alourdirait le seul écran qui doit rester
// simple.

interface Props {
  children: ReactNode;
  /** Rappelé avant le rendu de secours (purge de session, télémétrie…). */
  onErreur?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

const C = {
  bg: '#F4F9F9',
  carte: '#FFFFFF',
  bord: '#E0EEEE',
  encre: '#1A3A3A',
  discret: '#8FA8A8',
  accent: '#0F766E',
};

export default class ErrorBoundaryPatient extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Volontairement bruyant côté console : c'est la seule trace exploitable
    // quand un bénéficiaire décrit « ça ne marche plus » au téléphone.
    console.error('[portail patient] plantage au rendu :', error, info.componentStack);
    this.props.onErreur?.(error);
  }

  private recharger = (): void => {
    // Rechargement simple. On ne vide NI le cache du service worker, NI la
    // session : sur l'incident du 29/08, le service worker de l'ancienne
    // origine ne peut de toute façon plus se mettre à jour (son propre
    // script part en redirection cross-origin, ce que la spec traite comme
    // un échec). Effacer la session ferait juste perdre au bénéficiaire son
    // accès sans rien réparer.
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

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
            L'application n'a pas réussi à s'afficher
          </h1>

          {/* Aucune faute rejetée sur le bénéficiaire : ni « votre connexion »,
              ni « votre appareil ». La cause de l'incident du 29/08 était
              entièrement de notre côté. */}
          <p style={{ fontSize: 15, lineHeight: 1.55, color: C.encre, margin: '0 0 8px' }}>
            Le problème vient de l'application, pas de vous, et vos données
            n'ont rien perdu.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: C.discret, margin: '0 0 24px' }}>
            Réessayez maintenant. Si l'écran revient, prévenez votre enseignant
            en Activité Physique Adaptée : il saura quoi faire.
          </p>

          <button
            type="button"
            onClick={this.recharger}
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

          {/* Repliée : le bénéficiaire n'a pas à lire ça, mais quand il appelle
              son enseignant, c'est la seule information utile à lire à voix
              haute. */}
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
              {error.message || String(error)}
              {'\n'}
              {window.location.origin}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
