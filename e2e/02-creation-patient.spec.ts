import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

test.describe('Création d\'un participant', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer une nouvelle fiche participant', async ({ page }) => {
    await loginPraticien(page);

    await page.goto('/participants/nouveau');

    const prenom = 'Test';
    const nom = `E2E${Date.now()}`;

    await page.getByPlaceholder('Jean').fill(prenom);
    await page.getByPlaceholder('Dupont').fill(nom);

    // Stepper en 5 étapes — aucun champ n'est requis avant l'étape finale.
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Suivant →' }).click();
    }

    await page.getByRole('button', { name: 'Créer la fiche' }).click();

    await expect(page.getByText(`${prenom} ${nom} ajouté(e) !`)).toBeVisible();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
  });
});
