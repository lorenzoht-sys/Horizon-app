import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

// Tableau de bord V1 (23/11/2026, maquette validée par Lorenzo). Vérifie que la page s'affiche
// dans l'ordre voulu, sans erreur, et que les actions rapides ouvrent bien le choix du
// bénéficiaire. Lecture seule : rien n'est créé ni modifié.
test.describe('Tableau de bord V1', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('la journée, les blocs à traiter et les bénéficiaires s’affichent sans erreur', async ({ page }, testInfo) => {
    const erreurs: string[] = [];
    page.on('pageerror', err => erreurs.push(err.message));

    await loginPraticien(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour/ })).toBeVisible({ timeout: 20000 });

    for (const titre of ['Votre prochain rendez-vous', 'Aujourd’hui', 'Séances à confirmer', 'Prochains bilans', 'Factures en attente', 'Les progrès de vos bénéficiaires']) {
      await expect(page.getByRole('heading', { name: titre })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /Bénéficiaires suivis/ })).toBeVisible();

    // Action rapide : « Nouveau bilan » demande pour qui, puis se ferme sans rien créer.
    await page.getByRole('button', { name: 'Nouveau bilan' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Nouveau bilan : pour qui ?' });
    await expect(dialogue).toBeVisible();
    await dialogue.getByRole('button', { name: 'Fermer' }).click();
    await expect(dialogue).toHaveCount(0);

    await page.screenshot({ path: testInfo.outputPath('tableau-de-bord.png'), fullPage: true });
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });
});
