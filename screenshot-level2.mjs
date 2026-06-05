import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Auth bypass + clear patients pour forcer le skeleton
await page.goto('http://localhost:5173');
await page.evaluate(() => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('horizon_local_patients', JSON.stringify([]));
});

// 1. Capturer le skeleton (les 900ms juste après le chargement)
await page.goto('http://localhost:5173');
await page.waitForTimeout(200); // Catch skeleton early
await page.screenshot({ path: 'level2-01-skeleton.png' });
console.log('✓ skeleton');

// 2. Attendre la fin du skeleton + remettre les patients
await page.evaluate(() => {
  const patients = JSON.parse(localStorage.getItem('horizon_local_patients') || '[]');
  if (patients.length === 0) {
    // Remettre les patients de démo
    localStorage.removeItem('horizon_local_patients');
  }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'level2-02-dashboard-loaded.png' });
console.log('✓ dashboard chargé');

// 3. Toast — cliquer Nouveau participant et annuler (pour déclencher un toast si possible)
// On va naviguer vers agenda pour déclencher la page transition
await page.locator('text=Agenda').click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'level2-03-page-transition.png' });
console.log('✓ page transition');

await browser.close();
console.log('Done.');
