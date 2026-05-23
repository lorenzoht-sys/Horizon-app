const { test } = require('@playwright/test');

test('Horizon rebrand', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('onboarding_complete', 'true');
  });

  // Dashboard avec sidebar
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/loren/hz_01_dashboard.png', fullPage: false });

  // Login page
  await page.evaluate(() => localStorage.removeItem('isLoggedIn'));
  await page.goto('/login');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/loren/hz_02_login.png', fullPage: false });

  // Reconnexion et fiche patient
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('onboarding_complete', 'true');
  });
  await page.goto('/participant/demo-1');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/loren/hz_03_patient.png', fullPage: false });
});
