import { test, expect } from '@playwright/test';
import { skipUnlessE2E, env } from './helpers.js';

test.describe('Séance du jour — coche d\'exercice', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un patient peut faire sa séance du jour et l\'enregistrer', async ({ page }) => {
    await page.goto('/patient');
    await page.getByPlaceholder('Entrez votre code…').fill(env.patientCode);
    await page.getByRole('button', { name: /Accéder à mon espace/ }).click();
    await page.waitForURL(/\/patient\/[0-9a-fA-F-]+$/);

    await page.getByRole('button', { name: /Programme/ }).click();
    await page.getByRole('button', { name: '▶️ COMMENCER LA SÉANCE' }).first().click();

    // Coche chaque exercice jusqu'à l'écran de fin (le nombre d'exercices
    // dépend de la séance planifiée, donc boucle bornée plutôt qu'un nombre fixe).
    for (let i = 0; i < 10; i++) {
      if (await page.getByText('Séance terminée !').isVisible()) break;
      await page.getByRole('button', { name: "✅ J'ai fait cet exercice" }).click();
    }

    await expect(page.getByText('Séance terminée !')).toBeVisible();

    await page.getByRole('button', { name: '💾 Valider et enregistrer' }).click();

    await expect(page.getByText('Séance terminée !')).not.toBeVisible();
  });
});
