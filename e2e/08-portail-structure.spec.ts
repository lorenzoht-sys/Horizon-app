import { test, expect } from '@playwright/test';
import { skipUnlessE2E, env } from './helpers.js';

test.describe('Portail structure', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un token valide affiche les patients rattachés à la structure', async ({ page }) => {
    await page.goto(`/structure/${env.structureToken}`);

    await expect(page.getByText(`${env.patientPrenom2} ${env.patientNom2}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voir le détail →' })).toBeVisible();
  });

  test('un token invalide affiche un message d\'accès non autorisé', async ({ page }) => {
    await page.goto('/structure/token-invalide-0000');

    await expect(page.getByText('Accès non autorisé')).toBeVisible();
    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
  });
});
