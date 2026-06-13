import { defineConfig, devices } from '@playwright/test';

// Tâche 5 (consolidation) — suite E2E Playwright.
//
// La suite cible un VRAI déploiement (Preview Vercel + projet Supabase de
// staging, voir supabase/migrations/SETUP_STAGING.md) via E2E_BASE_URL, car
// les routes /api/* (serverless) ne sont pas disponibles avec `npm run dev`
// (pas de CLI Vercel). Sans E2E_BASE_URL, tous les tests sont ignorés
// (voir e2e/helpers.ts et e2e/README.md) : `npx playwright test` reste donc
// utilisable (0 test exécuté) même sans environnement de staging configuré.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
