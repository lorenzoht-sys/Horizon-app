import { defineConfig } from 'vitest/config';

// Tests unitaires des fonctions pures : cron de rappels (api/_lib/rappels.ts),
// planificateur de tournée (src/lib/planificateur.ts) et utilitaires de dates
// (src/utils/horaires.ts). Séparé de la config Playwright (e2e/) : ici, pas
// de navigateur — uniquement de la logique métier + tests/security/*.spec.ts
// (RLS multi-tenant), qui parlent directement à un projet Supabase de
// staging via des variables d'environnement (auto-skip si absentes, voir
// l'en-tête de chaque fichier de tests/security/).
export default defineConfig({
  test: {
    include: ['api/**/*.test.ts', 'src/lib/**/*.test.ts', 'src/utils/**/*.test.ts', 'tests/security/*.spec.ts'],
    environment: 'node',
  },
});
