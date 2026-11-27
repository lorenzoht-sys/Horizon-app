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
      // Base de facturation : exige une base Postgres LOCALE (supabase start). Ignorée
      // avec un message si elle est absente ; voir tests/db/facturation.spec.ts.
      'tests/db/*.spec.ts',
      // Edge Functions Supabase : seuls les modules PURS sont testés ici
      // (supabase/functions/*/garde-prompt.ts). `index.ts` importe deno.land
      // et ne peut pas être chargé par Vitest — il n'est pas dans le motif.
      'supabase/functions/**/*.test.ts',
    ],
    environment: 'node',
    // src/lib/supabase.ts exige ces deux variables depuis le retrait du mode sans
    // base (27/11/2026). Valeurs fictives : aucun test unitaire n'appelle le réseau.
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'cle-anonyme-de-test',
    },
  },
});
