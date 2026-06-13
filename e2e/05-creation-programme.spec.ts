import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Création d\'un programme', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un programme et le partager avec un participant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);

    await page.goto(`${page.url()}/programme`);

    await page.getByRole('button', { name: 'Créer un programme' }).first().click();

    // Étape 1/4 — seul le nom est requis pour avancer.
    await page.getByPlaceholder('ex: Programme Équilibre').fill(`Programme E2E ${Date.now()}`);

    // Étapes 2/4 (Séances) et 3/4 (Planning) : optionnelles, "Suivant" sans blocage.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Suivant/ }).click();
    }

    // Étape 4/4 — Récapitulatif.
    await page.getByRole('button', { name: '✅ Sauvegarder et partager' }).click();

    await expect(page.getByText('Programme créé et partagé avec le patient !')).toBeVisible();
  });
});
