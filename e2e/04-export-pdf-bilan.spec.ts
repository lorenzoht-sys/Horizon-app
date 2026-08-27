import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Export PDF d\'un bilan', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut générer le PDF d\'un bilan existant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom} ${env.patientNom}`);

    // Ouvre le premier bilan de la timeline. Ciblé par son href plutôt que
    // par son libellé : la page porte plusieurs éléments contenant « Voir »
    // (« Voir complet → », « Voir l'espace bénéficiaire »), et le lien du
    // bilan est le seul qui pointe vers /bilan/.
    // `:not([href$="new"])` exclut le lien « nouveau bilan »
    // (/participant/<id>/bilan/new), qui partage le même préfixe d'URL.
    const lienBilan = page.locator('a[href*="/bilan/"]:not([href$="new"])').first();
    await expect(lienBilan).toBeVisible();
    await lienBilan.click();

    // `toHaveURL` plutôt que `waitForURL` : la navigation est côté client
    // (React Router), donc aucun événement `load` ne survient — ce que
    // `waitForURL` attend par défaut.
    await expect(page).toHaveURL(/\/bilan\/[0-9a-fA-F-]+$/);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Fiche bilan PDF/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
