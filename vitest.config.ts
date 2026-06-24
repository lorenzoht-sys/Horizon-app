import { defineConfig } from 'vitest/config';

// Tests unitaires des fonctions pures : cron de rappels (api/_lib/rappels.ts)
// et planificateur de tournée (src/lib/planificateur.ts). Séparé de la config
// Playwright (e2e/) : ici, pas de navigateur, pas de serveur — uniquement de
// la logique métier (dates, préférences, anti-doublon, assignation des jours).
export default defineConfig({
  test: {
    include: ['api/**/*.test.ts', 'src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
