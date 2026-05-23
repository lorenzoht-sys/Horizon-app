const { test } = require('@playwright/test');

test('redesign fiche patient', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('onboarding_complete', 'true');
  });

  // Fiche patient
  await page.goto('/participant/demo-1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/loren/rd_01_header.png' });

  // Scroll mi-page pour voir la grille
  await page.evaluate(() => window.scrollTo(0, 380));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/loren/rd_02_grille.png' });

  // Scroll bas pour accordéons
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/loren/rd_03_accordeons.png' });

  // Ouvrir accordéon bilans
  await page.getByText('📊 Historique des bilans').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/loren/rd_04_historique_ouvert.png' });

  // Vue client
  const token = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('mouvtrack_participants');
      if (!raw) return null;
      const ps = JSON.parse(raw);
      return ps[0]?.token ?? null;
    } catch { return null; }
  });

  if (token) {
    await page.goto(`/client/${token}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'C:/Users/loren/rd_05_client_progres.png' });

    await page.getByText('📋 Historique').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'C:/Users/loren/rd_06_client_historique.png' });
  }
});
