import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

test.describe('Connexion praticien', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut se connecter et accéder au tableau de bord', async ({ page }) => {
    await loginPraticien(page);

    // Délai élargi volontairement : c'est la toute première page rendue
    // après connexion, sur un déploiement dont les fonctions peuvent
    // démarrer à froid. Ce test est sorti « flaky » le 2026-08-27 (échec
    // puis succès au second essai) avec le délai par défaut de 5 s — un
    // test intermittent ne vaut guère mieux qu'un test absent.
    await expect(page.getByRole('button', { name: /Nouveau participant/ })).toBeVisible({ timeout: 20000 });
  });
});
