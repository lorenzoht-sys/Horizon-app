import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Création d\'un contrat de suivi', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un contrat avec les valeurs par défaut', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);

    await page.goto(`${page.url()}/contrat/nouveau`);

    await page.getByRole('button', { name: 'Créer le contrat et générer les séances' }).click();

    // Le contrat ne génère PLUS les séances automatiquement : la génération
    // est passée sur Tournée → Planifier, et le message de confirmation le
    // dit (ContratNouveauPage.tsx:126). Ce test affirmait encore l'ancien
    // comportement — il décrivait un produit qui n'existe plus.
    await expect(page.getByText(/Contrat créé\. Allez sur Tournée/)).toBeVisible();
  });
});
