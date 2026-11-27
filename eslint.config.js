import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Espaces insécables : typographie française voulue (« … », « 14 h »), dans
      // les commentaires, le JSX, les gabarits et les expressions régulières.
      'no-irregular-whitespace': ['error', { skipComments: true, skipJSXText: true, skipTemplates: true, skipRegExps: true }],
      // Préfixe « _ » : paramètre imposé par une signature (mock, callback) ou
      // propriété écartée par déstructuration ({ cle: _cle, ...reste }).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
    },
  },
])
