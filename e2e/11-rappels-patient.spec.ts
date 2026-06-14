import { test, expect } from '@playwright/test';
import { skipUnlessE2E, env } from './helpers.js';

test.describe('Rappels automatiques - espace patient', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('la section "Rappels" est visible dans l\'espace patient', async ({ page }) => {
    await page.goto('/patient');

    await page.getByPlaceholder('Entrez votre code…').fill(env.patientCode);
    await page.getByRole('button', { name: /Accéder à mon espace/ }).click();
    await page.waitForURL(/\/patient\/[0-9a-fA-F-]+$/);

    // L'état affiché dépend du support push du navigateur (actif / inactif /
    // iOS / non supporté / refusé), mais l'en-tête "🔔 ..." est toujours visible.
    await expect(page.getByText(/🔔/).first()).toBeVisible();
  });
});
