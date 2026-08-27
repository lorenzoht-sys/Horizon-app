import { defineConfig, devices } from '@playwright/test';

// Tâche 5 (consolidation) — suite E2E Playwright.
//
// La suite cible un VRAI déploiement (Preview Vercel + projet Supabase de
// staging, voir supabase/migrations/SETUP_STAGING.md) via E2E_BASE_URL, car
// les routes /api/* (serverless) ne sont pas disponibles avec `npm run dev`
// (pas de CLI Vercel). Sans E2E_BASE_URL, tous les tests sont ignorés
// (voir e2e/helpers.ts et e2e/README.md) : `npx playwright test` reste donc
// utilisable (0 test exécuté) même sans environnement de staging configuré.
//
// ── Protection de déploiement Vercel ────────────────────────────────────
// Le projet a `ssoProtection: all_except_custom_domains` : tout déploiement
// sans domaine personnalisé — donc tous les Preview — est derrière
// l'authentification Vercel. Une requête automatisée y est redirigée (302)
// vers le SSO et n'atteint jamais l'application.
//
// L'en-tête `x-vercel-protection-bypass` lève cette protection pour la
// requête, avec le secret « Protection Bypass for Automation » du projet
// (Vercel > Settings > Deployment Protection). `x-vercel-set-bypass-cookie`
// pose en plus un cookie, sans quoi seule la requête portant l'en-tête
// passerait : les navigations et sous-ressources déclenchées ensuite par le
// navigateur seraient de nouveau bloquées.
//
// Sans ce secret, la sonde de e2e/global-setup.ts arrête la suite avec un
// message explicite plutôt que de laisser douze tests expirer un par un.
const bypassVercel = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: 'on-first-retry',
    ...(bypassVercel
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': bypassVercel,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
