import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('http://localhost:5173');
await page.evaluate(() => {
  localStorage.setItem('isLoggedIn', 'true');
});
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 1. Dashboard complet
await page.screenshot({ path: 'level1-01-dashboard.png' });
console.log('✓ dashboard');

// 2. Zoom sur la sidebar + gradient mesh visible
await page.screenshot({ path: 'level1-02-sidebar-zoom.png', clip: { x: 0, y: 0, width: 600, height: 900 } });
console.log('✓ sidebar zoom');

// 3. Zoom sur les cards patients
await page.screenshot({ path: 'level1-03-cards.png', clip: { x: 220, y: 380, width: 1220, height: 420 } });
console.log('✓ cards');

// 4. Scroller pour voir l'effet topbar
await page.evaluate(() => {
  const el = document.querySelector('[style*="overflow-y: auto"]') || document.querySelector('[style*="overflowY"]');
  if (el) el.scrollTop = 200;
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'level1-04-scrolled.png' });
console.log('✓ scrolled topbar');

await browser.close();
console.log('Done.');
