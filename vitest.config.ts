import { defineConfig } from 'vitest/config';

// Tests unitaires des fonctions pures du cron de rappels (api/_lib/rappels.ts).
// Séparé de la config Playwright (e2e/) : ici, pas de navigateur, pas de
// serveur — uniquement de la logique métier (dates, préférences, anti-doublon).
export default defineConfig({
  test: {
    include: ['api/**/*.test.ts'],
    environment: 'node',
  },
});
