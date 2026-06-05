import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({ width: 1280, height: 900 });
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('isLoggedIn', 'true'));
await p.goto('http://localhost:5173/participant/demo-2/bilan/new', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);

// Scroll vers la section Activité physique
await p.evaluate(() => {
  const els = document.querySelectorAll('h3');
  for (const el of els) {
    if (el.textContent.includes('activit') || el.textContent.includes('Activit')) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      break;
    }
  }
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'sed-07-activite.png' });
console.log('07 activite ok');

// Scroll vers la section Fatigue FSS
await p.evaluate(() => {
  const els = document.querySelectorAll('h3');
  for (const el of els) {
    if (el.textContent.includes('Fatigue') || el.textContent.includes('fatigue')) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      break;
    }
  }
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'sed-08-fss.png' });
console.log('08 fss ok');

// Cliquer sur "Oui" pour activité physique puis screenshot avec le score
await p.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.trim() === 'Oui · 5') { btn.click(); break; }
  }
});
await p.waitForTimeout(300);
// Cliquer "3-4h" pour fréquence
await p.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.trim() === '3x/sem') { btn.click(); break; }
  }
});
await p.waitForTimeout(200);
// Cliquer sur une durée
await p.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  let count = 0;
  for (const btn of buttons) {
    if (btn.textContent.trim() === '31-45 min') {
      count++;
      if (count === 1) { btn.click(); break; }
    }
  }
});
await p.waitForTimeout(200);
// Scroll vers le bas de la section pour voir le score
await p.evaluate(() => {
  const els = document.querySelectorAll('h3');
  for (const el of els) {
    if (el.textContent.includes('activit') || el.textContent.includes('Activit')) {
      const parent = el.closest('.bg-white');
      if (parent) parent.scrollIntoView({ behavior: 'instant', block: 'end' });
      break;
    }
  }
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'sed-09-score-activite.png' });
console.log('09 score activite ok');

await b.close();
