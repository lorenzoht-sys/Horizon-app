import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const DIST = join(__dirname, 'dist');
const PORT = 9876;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// Simple static file server from dist/
const server = createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = join(DIST, urlPath);
  if (!existsSync(filePath)) filePath = join(DIST, 'index.html'); // SPA fallback
  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

await new Promise(r => server.listen(PORT, '127.0.0.1', r));
console.log(`Static server on http://127.0.0.1:${PORT}`);

const BASE = `http://127.0.0.1:${PORT}`;
const OUT = (n) => join(__dirname, `verify-${n}.png`);

const browser = await chromium.launch({ headless: true });

// ── Desktop 1280×900 ──────────────────────────────────────────────────────────
const desk = await browser.newPage();
await desk.setViewportSize({ width: 1280, height: 900 });

// Inject fake Supabase session so the app thinks we're logged in
await desk.addInitScript(() => {
  // Stub supabase so the app skips real auth and goes to dashboard
  Object.defineProperty(window, '__SUPABASE_BYPASS__', { value: true });
  // Provide localStorage flags the app checks for guest/demo mode
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('settings_praticien', JSON.stringify({
    prenom: 'Pierre', nom: 'Clavier', titre: 'Enseignant APA',
    email: 'pierre@horizon.fr', telephone: '', siret: '12345678901234',
    numeroSAP: 'SAP123456789', villeSignature: 'Paris', tarifHoraire: '45',
    societe: '', adresseRue: '', adresseCodePostal: '', adresseVille: '',
  }));
  // Provide some fake participants
  localStorage.setItem('mouvtrack_participants', JSON.stringify([
    { id: 'aaa1', prenom: 'Marie', nom: 'Dupont', dateNaissance: '1945-03-15',
      pathologie: 'Arthrose genou droit', bilans: [], telephone: '06 12 34 56 78', token: 'tok1' },
    { id: 'bbb2', prenom: 'Jean', nom: 'Martin', dateNaissance: '1938-07-22',
      contexteClinic: 'Diabète T2', bilans: [], telephone: '', token: 'tok2' },
    { id: 'ccc3', prenom: 'Suzanne', nom: 'Bernard', dateNaissance: '1952-11-08',
      pathologie: 'PTH droite 2023', bilans: [{ id: 'b1', date: '2024-01-15', type: 'initial' }], token: 'tok3' },
  ]));
});

await desk.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await desk.waitForTimeout(2000);

const url1 = desk.url();
console.log('Desktop URL after load:', url1);
await desk.screenshot({ path: OUT('01-desktop-initial') });

// Check if sidebar is present (rendered after login guard)
const sidebar = await desk.$('.fixed.left-0.top-0.bottom-0');
console.log('Sidebar found:', sidebar !== null);

// Check sidebar bg color
if (sidebar) {
  const bg = await sidebar.evaluate(el => window.getComputedStyle(el).backgroundColor);
  console.log('Sidebar bg:', bg); // expect rgb(13,43,43)
}

// Screenshot the full desktop dashboard
await desk.screenshot({ path: OUT('02-desktop-full'), fullPage: false });

// Sidebar closeup
await desk.screenshot({ path: OUT('03-sidebar'), clip: { x: 0, y: 0, width: 230, height: 900 } });

// Sidebar bottom (user section)
await desk.screenshot({ path: OUT('04-sidebar-bottom'), clip: { x: 0, y: 680, width: 230, height: 220 } });

// Active nav item
const activeItem = await desk.$('.sidebar-nav-active');
if (activeItem) {
  const box = await activeItem.boundingBox();
  console.log('Active nav box:', box);
  const shadow = await activeItem.evaluate(el => window.getComputedStyle(el).boxShadow);
  const color = await activeItem.evaluate(el => window.getComputedStyle(el).color);
  console.log('Active nav box-shadow:', shadow);
  console.log('Active nav color:', color);
  await desk.screenshot({ path: OUT('05-active-nav'), clip: { x: 0, y: box.y - 5, width: 230, height: box.height + 10 } });
}

// Online dot
const onlineDot = await desk.$('.online-pulse');
if (onlineDot) {
  const dotBg = await onlineDot.evaluate(el => window.getComputedStyle(el).backgroundColor);
  console.log('Online dot bg color:', dotBg); // expect rgb(39,174,96)
}

// Main content area: stats cards
await desk.screenshot({ path: OUT('06-main-content'), clip: { x: 220, y: 0, width: 1060, height: 500 } });

// Stats cards DOM check
const statCards = await desk.$$('.rounded-2xl.shadow-sm');
console.log('Stat cards with shadow-sm:', statCards.length);

// Icon bg in stats
const iconBgs = await desk.$$eval('[style*="E8F9F9"]', els => els.map(el => ({
  tag: el.tagName,
  style: el.style.background || el.style.backgroundColor
})));
console.log('Elements with E8F9F9 bg:', iconBgs.length);

// Dashboard header
const h1 = await desk.$('h1');
if (h1) {
  const h1Text = await h1.textContent();
  const h1Style = await h1.evaluate(el => ({
    fontSize: window.getComputedStyle(el).fontSize,
    fontWeight: window.getComputedStyle(el).fontWeight,
    color: window.getComputedStyle(el).color,
  }));
  console.log('H1 text:', h1Text?.trim());
  console.log('H1 styles:', h1Style);
}

// Buttons check
const primaryBtn = await desk.$('button[style*="#2BBFBF"], button[style*="2BBFBF"]');
console.log('Primary button found:', primaryBtn !== null);

// Participant cards
const partCards = await desk.$$('[style*="E2EEEE"]');
console.log('Elements with E2EEEE border:', partCards.length);

// ── Mobile 375×812 ────────────────────────────────────────────────────────────
const mob = await browser.newPage();
await mob.setViewportSize({ width: 375, height: 812 });
await mob.addInitScript(() => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('settings_praticien', JSON.stringify({
    prenom: 'Pierre', nom: 'Clavier', titre: 'Enseignant APA',
    email: '', telephone: '', siret: '12345', numeroSAP: 'SAP1', villeSignature: '', tarifHoraire: '45',
    societe: '', adresseRue: '', adresseCodePostal: '', adresseVille: '',
  }));
  localStorage.setItem('mouvtrack_participants', JSON.stringify([
    { id: 'aaa1', prenom: 'Marie', nom: 'Dupont', dateNaissance: '1945-03-15', pathologie: 'Arthrose', bilans: [], token: 'tok1' },
  ]));
});

await mob.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await mob.waitForTimeout(2000);

await mob.screenshot({ path: OUT('07-mobile-full') });

// Bottom nav area
await mob.screenshot({ path: OUT('08-mobile-bottomnav'), clip: { x: 0, y: 745, width: 375, height: 67 } });

// Check bottom nav shadow
const bottomNav = await mob.$('[style*="0 -2px 20px"]');
console.log('Bottom nav has upward shadow:', bottomNav !== null);

// Check active dot
const activeDots = await mob.$$('span[style*="background: rgb(43, 191, 191)"]');
console.log('Active indicator dots:', activeDots.length);

// Active color check on icons
const activeColor = await mob.$('i[style*="color: rgb(43, 191, 191)"]');
console.log('Active nav icon with primary color:', activeColor !== null);

// Nav label check
const navLabels = await mob.$$eval('button span[style*="font-weight: 700"]', els =>
  els.map(el => el.textContent?.trim())
);
console.log('Bold nav labels (active):', navLabels);

await mob.screenshot({ path: OUT('09-mobile-accueil') });

await browser.close();
server.close();
console.log('\n=== All screenshots captured ===');
