import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('http://localhost:5173');
await page.evaluate(() => localStorage.setItem('isLoggedIn', 'true'));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);

// Sidebar complète
await page.screenshot({ path: 'varC-01-sidebar.png', clip: { x: 0, y: 0, width: 220, height: 900 } });
console.log('✓ sidebar');

// Vue globale
await page.screenshot({ path: 'varC-02-full.png' });
console.log('✓ full');

// Hover sur un item inactif
await page.hover('text=Agenda');
await page.waitForTimeout(200);
await page.screenshot({ path: 'varC-03-hover.png', clip: { x: 0, y: 0, width: 220, height: 900 } });
console.log('✓ hover');

await browser.close();
console.log('Done.');
