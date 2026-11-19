import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

// Contrôle de la facturation du mois (/factures/seances), ajouté le 2026-11-19 après les factures
// d'octobre manquantes. Lecture seule : le test vérifie que le tableau de contrôle se charge, que le mois
// précédent s'ouvre par ?mois=, et ne modifie aucune séance du staging. Joint une capture au rapport.
test.describe('Contrôle de la facturation', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('le tableau de contrôle du mois se charge, mois courant et mois précédent', async ({ page }, testInfo) => {
    const erreurs: string[] = [];
    page.on('pageerror', err => erreurs.push(err.message));

    await loginPraticien(page);
    await page.goto('/factures/seances');
    await expect(page.getByRole('heading', { name: 'Contrôle de la facturation' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('controle-synthese')).toBeVisible({ timeout: 20000 });
    for (const id of ['controle-dossiers', 'controle-prets', 'controle-a-verifier', 'controle-bloques', 'controle-a-confirmer', 'controle-contrats-incomplets']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    const moisCourant = await page.getByTestId('suivi-mois').textContent();

    await page.getByRole('button', { name: 'Mois précédent' }).click();
    await expect(page.getByTestId('suivi-mois')).not.toHaveText(moisCourant ?? '');
    await expect(page.getByTestId('controle-synthese')).toBeVisible({ timeout: 20000 });

    await page.screenshot({ path: testInfo.outputPath('controle-facturation.png'), fullPage: false });
    expect(erreurs).toEqual([]);
  });
});
