import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Création d\'un bilan', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un nouveau bilan pour un participant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom} ${env.patientNom}`);

    await page.getByRole('button', { name: '+ Nouveau bilan' }).click();
    await page.waitForURL(/\/bilan\/new$/);

    // Camille a déjà un bilan initial : le nouveau bilan est "trimestriel"
    // (5 étapes, "Suivant →" sans validation bloquante).
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Suivant →' }).click();
    }

    await page.getByRole('button', { name: 'Enregistrer le bilan' }).click();

    await expect(page.getByText('Bilan enregistré !')).toBeVisible();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+\/bilan\/[0-9a-fA-F-]+$/);
  });
});
