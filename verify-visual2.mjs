import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5175';
const OUT = (name) => path.join(__dirname, `verify-${name}.png`);

const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  await page.screenshot({ path: OUT(name), fullPage: false });
  console.log(`Screenshot saved: verify-${name}.png`);
}

// ── Desktop 1280x900 ──────────────────────────────────────────────────────────
const desktop = await browser.newPage();
await desktop.setViewportSize({ width: 1280, height: 900 });
await desktop.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });

// Check what page we land on (may be login)
const url = desktop.url();
console.log('Landing URL:', url);
await shot(desktop, '01-landing');

// If login page, try to fill credentials or skip auth
const isLogin = url.includes('login') || await desktop.$('input[type="password"]') !== null;
console.log('Is login page:', isLogin);

if (isLogin) {
  // Try demo credentials or fill form
  const emailInput = await desktop.$('input[type="email"], input[type="text"]');
  const passInput = await desktop.$('input[type="password"]');

  if (emailInput && passInput) {
    await emailInput.fill('demo@horizon.fr');
    await passInput.fill('demo1234');
    await desktop.screenshot({ path: OUT('02-login-filled') });

    const submitBtn = await desktop.$('button[type="submit"], button:has-text("Connexion"), button:has-text("Se connecter")');
    if (submitBtn) {
      await submitBtn.click();
      await desktop.waitForTimeout(2000);
    }
  }
  await shot(desktop, '02-after-login-attempt');
}

// Check current state after potential login
const currentUrl = desktop.url();
console.log('Current URL:', currentUrl);

// If still on login page, capture the login page visuals for now
// and look for sidebar/dashboard indicators
const hasSidebar = await desktop.$('[style*="0D2B2B"], [style*="#0D2B2B"]') !== null;
console.log('Has sidebar with new color:', hasSidebar);

// Try navigating to root if not there
if (!currentUrl.endsWith('/') && !currentUrl.endsWith('5173/')) {
  await desktop.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
}

await shot(desktop, '03-dashboard-desktop');

// Check sidebar presence and color
const sidebarEl = await desktop.$('.fixed.left-0');
if (sidebarEl) {
  const sidebarBox = await sidebarEl.boundingBox();
  console.log('Sidebar bounding box:', sidebarBox);
  await desktop.screenshot({
    path: OUT('04-sidebar-only'),
    clip: { x: 0, y: 0, width: 240, height: 900 }
  });
}

// Check active nav item for left bar indicator
const activeNav = await desktop.$('.sidebar-nav-active');
if (activeNav) {
  const navBox = await activeNav.boundingBox();
  console.log('Active nav item found:', navBox);
  // Get computed styles
  const boxShadow = await activeNav.evaluate(el => window.getComputedStyle(el).boxShadow);
  const bg = await activeNav.evaluate(el => window.getComputedStyle(el).background);
  console.log('Active nav box-shadow:', boxShadow);
  console.log('Active nav background:', bg);
}

// Check stats cards
const statsCards = await desktop.$$('.rounded-2xl');
console.log('Cards found:', statsCards.length);

// Check online dot
const onlineDot = await desktop.$('.online-pulse');
if (onlineDot) {
  const dotBox = await onlineDot.boundingBox();
  console.log('Online dot found:', dotBox);
  const dotBg = await onlineDot.evaluate(el => window.getComputedStyle(el).backgroundColor);
  console.log('Online dot color:', dotBg);
}

// Bottom section of sidebar
await desktop.screenshot({
  path: OUT('05-sidebar-bottom'),
  clip: { x: 0, y: 650, width: 240, height: 250 }
});

// Stats section
await desktop.screenshot({
  path: OUT('06-stats-cards'),
  clip: { x: 220, y: 0, width: 1060, height: 400 }
});

// Full dashboard
await shot(desktop, '07-full-dashboard');

// ── Mobile 375x812 ────────────────────────────────────────────────────────────
const mobile = await browser.newPage();
await mobile.setViewportSize({ width: 375, height: 812 });
await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });

// If login, try same credentials
const mobileIsLogin = await mobile.$('input[type="password"]') !== null;
if (mobileIsLogin) {
  const mEmail = await mobile.$('input[type="email"], input[type="text"]');
  const mPass = await mobile.$('input[type="password"]');
  if (mEmail && mPass) {
    await mEmail.fill('demo@horizon.fr');
    await mPass.fill('demo1234');
    const btn = await mobile.$('button[type="submit"]');
    if (btn) { await btn.click(); await mobile.waitForTimeout(2000); }
  }
}

await shot(mobile, '08-mobile-full');

// Bottom nav
await mobile.screenshot({
  path: OUT('09-mobile-bottomnav'),
  clip: { x: 0, y: 740, width: 375, height: 72 }
});

// Check bottom nav dot indicator
const activeDot = await mobile.$('span[style*="background: rgb(43, 191, 191)"]');
console.log('Mobile active dot:', activeDot !== null);

// Check box-shadow on nav
const bottomNav = await mobile.$('[style*="0 -2px 20px"]');
console.log('Bottom nav with shadow:', bottomNav !== null);

// Get all nav buttons
const navBtns = await mobile.$$('button');
console.log('Mobile buttons count:', navBtns.length);

await browser.close();
console.log('Done. All screenshots saved.');
