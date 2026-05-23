const { test } = require('@playwright/test');

test('screenshot journal feature', async ({ page }) => {
  // Bypass login + onboarding via localStorage
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('onboarding_complete', 'true');
  });

  // Reload to dashboard
  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'C:/Users/loren/ss_01_dashboard.png' });

  // Navigate directly to first demo participant
  await page.goto('/participant/demo-1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/loren/ss_02_profile_top.png' });

  // Scroll to journal section at bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/loren/ss_03_journal_section.png' });

  // Back to top and click Note séance button
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /note séance/i }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'C:/Users/loren/ss_04_modal_empty.png' });

  // Select "Bien" ressenti
  await page.getByRole('button', { name: /Bien/i }).click();
  await page.waitForTimeout(200);

  // Check "Progression notable"
  await page.locator('text=Progression notable').click();
  await page.waitForTimeout(200);

  // Type a note
  await page.fill('textarea', "Excellent travail sur l'équilibre. Tient 30 sec en unipodal !");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'C:/Users/loren/ss_05_modal_filled.png' });

  // Save the note
  await page.getByRole('button', { name: /Enregistrer/i }).click();
  await page.waitForTimeout(1000);

  // Scroll down to see the journal with the saved note
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'C:/Users/loren/ss_06_journal_with_note.png' });
});
