import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Création d\'un contrat de suivi', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un contrat avec les valeurs par défaut', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);

    await page.goto(`${page.url()}/contrat/nouveau`);

    await page.getByRole('button', { name: 'Créer le contrat et générer les séances' }).click();

    await expect(page.getByText(/Contrat créé — \d+ séances générées automatiquement/)).toBeVisible();
  });
});
