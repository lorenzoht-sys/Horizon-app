import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const consoleMessages = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

await page.addInitScript(() => { localStorage.setItem('isLoggedIn', 'true'); });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('=== ERREURS ===');
errors.forEach(e => console.log(e));
if (errors.length === 0) console.log('Aucune erreur console');

const html = await page.content();
const hasRoot = html.includes('id="root"');
const rootContent = await page.$eval('#root', el => el.innerHTML.length);
console.log(`Root présent: ${hasRoot}, taille innerHTML: ${rootContent}`);

await browser.close();
