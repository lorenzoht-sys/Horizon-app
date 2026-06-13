import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Export PDF d\'un bilan', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut générer le PDF d\'un bilan existant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom} ${env.patientNom}`);

    // Ouvre le premier bilan de la timeline ("Voir →").
    await page.getByRole('link', { name: /Voir/ }).first().click();
    await page.waitForURL(/\/bilan\/[0-9a-fA-F-]+$/);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Fiche bilan PDF/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
