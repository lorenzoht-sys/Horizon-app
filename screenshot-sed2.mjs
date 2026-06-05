import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({ width: 1280, height: 900 });
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('isLoggedIn', 'true'));
await p.goto('http://localhost:5173/participant/demo-2/bilan/new', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);

// Trouver la section FSS (contient "Échelle de sévérité")
await p.evaluate(() => {
  const all = document.querySelectorAll('p, h3');
  for (const el of all) {
    if (el.textContent.includes('chelle de s') || el.textContent.includes('FSS')) {
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
      break;
    }
  }
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'sed-10-fss-section.png' });
console.log('10 FSS section ok');

// Remplir quelques réponses FSS (cliquer sur les boutons 5, 6, 7...)
// Questions FSS : cliquer sur "4" pour chaque question
const fssParent = await p.evaluate(() => {
  const all = document.querySelectorAll('p');
  for (const el of all) {
    if (el.textContent.includes('chelle de s')) {
      return true;
    }
  }
  return false;
});
console.log('FSS parent found:', fssParent);

// Scroll et interagir avec le score de sédentarité
await p.evaluate(() => {
  const all = document.querySelectorAll('h3');
  for (const el of all) {
    if (el.textContent.includes('Niveau d')) {
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
      break;
    }
  }
});
await p.waitForTimeout(300);

// Cliquer "2 à 3h" (score 4) pour sédentarité groupe A
const btns = await p.locator('button').all();
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === '2 à 3h') { await btn.click(); break; }
}
// Cliquer "Oui · 5"
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === 'Oui · 5') { await btn.click(); break; }
}
await p.waitForTimeout(300);
// Cliquer "3x/sem"
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === '3x/sem') { await btn.click(); break; }
}
// Cliquer "31-45 min" (1er occurrence)
let dureeClicked = false;
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === '31-45 min' && !dureeClicked) { await btn.click(); dureeClicked = true; break; }
}
// Cliquer "Modéré"
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === 'Modéré') { await btn.click(); break; }
}
// Groupe C
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === 'Modérée') { await btn.click(); break; }
}
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === '5-6h') { await btn.click(); break; }
}
let marcheClicked = false;
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === '31-45 min' && !marcheClicked) { await btn.click(); marcheClicked = true; break; }
}
for (const btn of btns) {
  const txt = await btn.textContent();
  if (txt?.trim() === '6-10') { await btn.click(); break; }
}

await p.waitForTimeout(500);

// Scroll bas de la section activité pour voir le score
await p.evaluate(() => {
  const all = document.querySelectorAll('h3');
  for (const el of all) {
    if (el.textContent.includes('Niveau d')) {
      const card = el.closest('.bg-white');
      if (card) card.scrollIntoView({ behavior: 'instant', block: 'end' });
      break;
    }
  }
});
await p.waitForTimeout(400);
await p.screenshot({ path: 'sed-11-score-card.png' });
console.log('11 score card ok');

await b.close();
