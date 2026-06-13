import { test, expect } from '@playwright/test';
import { skipUnlessE2E, env } from './helpers.js';

test.describe('Connexion patient', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un patient peut se connecter avec son code et voir son espace', async ({ page }) => {
    await page.goto('/patient');

    await page.getByPlaceholder('Entrez votre code…').fill(env.patientCode);
    await page.getByRole('button', { name: /Accéder à mon espace/ }).click();

    await page.waitForURL(/\/patient\/[0-9a-fA-F-]+$/);
    await expect(page.getByText(`Bonjour ${env.patientPrenom}`)).toBeVisible();
    await expect(page.getByText('📊 Dernier bilan')).toBeVisible();
    await expect(page.getByText('Vos programmes')).toBeVisible();
  });
});
