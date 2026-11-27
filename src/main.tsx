import { Buffer } from 'buffer';
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Polices servies par l'application elle-même (27/11/2026), au lieu de Google Fonts :
// chaque ouverture d'Horizon envoyait l'adresse IP du praticien ou du bénéficiaire
// à Google ; pour une application de santé en route vers le HDS, aucun tiers ne doit
// voir passer les visites. Mêmes graisses que l'ancien lien Google Fonts. Sous-ensemble
// latin seulement (le français y est entier, « œ » compris). Ces fichiers Fontsource
// n'ont pas d'unicode-range : un seul sous-ensemble par graisse, sinon le dernier gagne.
// En TypeScript plutôt qu'en @import CSS pour que knip voie les dépendances.
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/plus-jakarta-sans/latin-800-italic.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'
// Importé tôt : l'invite d'installation n'est émise qu'une fois, au chargement.
import './lib/installationPwa'

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
