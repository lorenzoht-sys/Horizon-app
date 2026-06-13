import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

test.describe('Connexion praticien', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut se connecter et accéder au tableau de bord', async ({ page }) => {
    await loginPraticien(page);

    await expect(page.getByRole('button', { name: /Nouveau participant/ })).toBeVisible();
  });
});
