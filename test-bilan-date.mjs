import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);

// Login
await page.fill('input[type="email"]', 'lorenzo.huet@gmail.com');
await page.fill('input[type="password"]', 'P4l4d!n30');
await page.click('button:has-text("Se connecter")');
await page.waitForTimeout(4000);
await page.screenshot({ path: 'test-results/step1-after-login.png', fullPage: true });
console.log('URL after login:', page.url());
console.log('BODY (first 1500):', (await page.locator('body').innerText()).slice(0, 1500));

await browser.close();
