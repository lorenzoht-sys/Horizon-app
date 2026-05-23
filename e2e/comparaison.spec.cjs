const { test } = require('@playwright/test');

test('comparaison page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('onboarding_complete', 'true');
  });

  // Fiche patient Martine Leroy (demo-1 a 3 bilans)
  await page.goto('/participant/demo-1');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/loren/cmp_01_fiche_avec_bouton.png' });

  // Cliquer sur "Évolution"
  await page.getByRole('link', { name: /évolution/i }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/loren/cmp_02_comparaison_top.png' });

  // Scroll vers le bas pour voir le graphique
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/loren/cmp_03_graphique.png' });

  // Scroll encore pour voir le résumé IA
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/loren/cmp_04_resume_ia.png' });
});
