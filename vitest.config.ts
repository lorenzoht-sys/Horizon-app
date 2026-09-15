import { defineConfig } from 'vitest/config';

// Tests unitaires des fonctions pures : cron de rappels (api/_lib/rappels.ts),
// planificateur de tournée (src/lib/planificateur.ts) et utilitaires de dates
// (src/utils/horaires.ts). Séparé de la config Playwright (e2e/) : ici, pas
// de navigateur, pas de serveur — uniquement de la logique métier (dates,
// préférences, anti-doublon, assignation des jours).
export default defineConfig({
  test: {
    include: [
      'api/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/utils/**/*.test.ts',
      'tests/security/*.spec.ts',
      // Edge Functions Supabase : seuls les modules PURS sont testés ici
      // (supabase/functions/*/garde-prompt.ts). `index.ts` importe deno.land
      // et ne peut pas être chargé par Vitest — il n'est pas dans le motif.
      'supabase/functions/**/*.test.ts',
    ],
    environment: 'node',
  },
});
