// Contrôle BLOQUANT en CI (job build) : la seule règle « react-hooks/rules-of-hooks ».
//
// `npm run lint` (eslint.config.js) a encore des erreurs pré-existantes et ne tourne pas en CI.
// Cette règle-là, elle, n'a aucune erreur au 27/11/2026 et vise un vrai plantage : un hook
// appelé après un retour anticipé fait planter l'écran au rendu suivant (PR #226, tableau de
// bord vide, vu seulement par l'e2e). `--no-inline-config` : les commentaires eslint-disable
// visent des règles que cette configuration ne charge pas.
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
])
