import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Auth + patients de démo
await page.goto('http://localhost:5173');
await page.evaluate(() => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.removeItem('horizon_local_patients'); // reset → sera rechargé par le hook
});

// Charger la page normalement — attendre 1.2s pour laisser le CountUp commencer
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1100); // skeleton visible encore

// Skeleton pendant la transition
await page.screenshot({ path: 'level2-03-skeleton-full.png' });
console.log('✓ skeleton full');

// Attendre la fin du min-load (900ms) + rendu
await page.waitForTimeout(600);
await page.screenshot({ path: 'level2-04-dashboard-patients.png' });
console.log('✓ dashboard avec patients');

await browser.close();
console.log('Done.');
