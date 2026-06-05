import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Injecter auth + patients AVANT le goto
await page.addInitScript(() => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.removeItem('horizon_local_patients');
});

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// Capturer skeleton (min-delay 900ms pas encore écoulé)
await page.screenshot({ path: 'level2-05-skeleton-early.png' });
console.log('✓ skeleton early');

// Attendre fin du min-delay + CountUp
await page.waitForTimeout(800);
await page.screenshot({ path: 'level2-06-dashboard-final.png' });
console.log('✓ dashboard final');

await browser.close();
console.log('Done.');
