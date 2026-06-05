import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.setItem('isLoggedIn', 'true'));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// Onglet Structures
await page.locator('button', { hasText: /Structures/ }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'design-04-structures.png' });
console.log('✓ onglet structures');

// Revenir indépendants + ouvrir le form
await page.locator('button', { hasText: /Indépendants/ }).click();
await page.waitForTimeout(400);
await page.locator('button', { hasText: 'Nouveau participant' }).click();
await page.waitForTimeout(700);

// Scroller jusqu'en bas du formulaire
const modal = page.locator('.overflow-y-auto').first();
await modal.evaluate(el => el.scrollTop = 9999);
await page.waitForTimeout(400);
await page.screenshot({ path: 'design-05-form-bas.png' });
console.log('✓ formulaire bas (RGPD + boutons)');

await browser.close();
console.log('Done.');
