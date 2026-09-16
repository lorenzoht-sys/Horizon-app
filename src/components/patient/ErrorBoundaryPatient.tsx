import { Component, type ReactNode, type ErrorInfo } from 'react';
import CarteErreurPatient from './CarteErreurPatient';

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
// promesse rejetée dans un `useEffect` ne passe PAS par ici : elle laisse
// l'écran sur son état de chargement, sans exception.
//
// Autrement dit : cette limite couvre l'écran blanc, pas l'écran figé.
// `void charger()` dans `EspacePatient.tsx` a désormais son propre
// try/catch/finally pour ce cas — même carte d'erreur (`CarteErreurPatient`,
// extraite d'ici), mais affichée en état local plutôt que rendue par cette
// classe.
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
      <CarteErreurPatient
        titre="L'application n'a pas réussi à s'afficher"
        // Aucune faute rejetée sur le bénéficiaire : ni « votre connexion »,
        // ni « votre appareil ». La cause de l'incident du 29/08 était
        // entièrement de notre côté.
        messagePrincipal="Le problème vient de l'application, pas de vous, et vos données n'ont rien perdu."
        messageSecondaire="Réessayez maintenant. Si l'écran revient, prévenez votre enseignant en Activité Physique Adaptée : il saura quoi faire."
        detailTechnique={error.message || String(error)}
        onReessayer={this.recharger}
      />
    );
  }
}
