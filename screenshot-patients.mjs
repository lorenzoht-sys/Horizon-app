import { chromium } from 'playwright';

const PATIENTS = [
  { id: 'p1', token: 'tok1', prenom: 'Martine', nom: 'Lefebvre', dateNaissance: '1948-03-12', dateCreation: '2026-01-08', email: 'martine.lefebvre@gmail.com', telephone: '06 12 34 56 78', adresseVille: 'Nantes', tags: [], bilans: [{ id: 'b1', date: '2026-03-15', type: 'initial', trimestre: 1, equilibre: { droite: 18, gauche: 14 }, chairStand30: 12, handGrip: { droite: 16, gauche: 14 }, tug3m: 11.2, souplesse: { methode: 'assis', valeur: -4 }, tm6: { distanceMetres: 380, fcAvant: 72, fcApres: 108, fc2min: 88, spo2Avant: 98, spo2Apres: 96, spo22min: 97, borgRPE: 13 }, memoire: { scoreImmediat: 8, scoreDiffere: 6 } }] },
  { id: 'p2', token: 'tok2', prenom: 'Jean-Pierre', nom: 'Morel', dateNaissance: '1955-07-22', dateCreation: '2026-01-15', email: 'jp.morel@orange.fr', telephone: '06 23 45 67 89', adresseVille: 'Saint-Nazaire', tags: [], bilans: [] },
  { id: 'p3', token: 'tok3', prenom: 'Sophie', nom: 'Bernard', dateNaissance: '1978-11-05', dateCreation: '2026-02-03', email: 'sophie.bernard@gmail.com', telephone: '06 34 56 78 90', adresseVille: 'Nantes', tags: [], bilans: [{ id: 'b3', date: '2026-04-10', type: 'initial', trimestre: 1, equilibre: { droite: 28, gauche: 24 }, chairStand30: 18, handGrip: { droite: 22, gauche: 20 }, tug3m: 7.8, souplesse: { methode: 'assis', valeur: 6 }, tm6: { distanceMetres: 520, fcAvant: 68, fcApres: 130, fc2min: 95, spo2Avant: 99, spo2Apres: 97, spo22min: 98, borgRPE: 11 }, memoire: { scoreImmediat: 14, scoreDiffere: 12 } }] },
  { id: 'p4', token: 'tok4', prenom: 'Robert', nom: 'Durand', dateNaissance: '1942-02-18', dateCreation: '2026-02-20', email: '', telephone: '06 45 67 89 01', adresseVille: 'La Baule', taille: 172, poids: 78, tags: [], bilans: [] },
  { id: 'p5', token: 'tok5', prenom: 'Isabelle', nom: 'Martin', dateNaissance: '1960-09-30', dateCreation: '2026-03-01', email: 'i.martin@wanadoo.fr', telephone: '06 56 78 90 12', adresseVille: 'Rezé', tags: [], bilans: [{ id: 'b5', date: '2026-05-02', type: 'initial', trimestre: 1, equilibre: { droite: 22, gauche: 20 }, chairStand30: 10, handGrip: { droite: 18, gauche: 16 }, tug3m: 13.5, souplesse: { methode: 'assis', valeur: -8 }, tm6: { distanceMetres: 320, fcAvant: 78, fcApres: 118, fc2min: 92, spo2Avant: 97, spo2Apres: 94, spo22min: 95, borgRPE: 15 }, memoire: { scoreImmediat: 9, scoreDiffere: 7 } }] },
  { id: 'p6', token: 'tok6', prenom: 'Thomas', nom: 'Petit', dateNaissance: '1992-04-14', dateCreation: '2026-03-10', email: 'thomas.petit@gmail.com', telephone: '07 12 34 56 78', adresseVille: 'Nantes', taille: 180, poids: 74, tags: [], bilans: [] },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Injecter les patients dans localStorage avant de charger l'app
await page.goto('http://localhost:5173');
await page.evaluate((patients) => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('horizon_local_patients', JSON.stringify(patients));
}, PATIENTS);

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. Dashboard avec patients
await page.screenshot({ path: 'patients-01-dashboard.png' });
console.log('✓ dashboard avec 6 patients');

// 2. Ouvrir le formulaire de création
await page.locator('button', { hasText: 'Nouveau participant' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: 'patients-02-form.png' });
console.log('✓ formulaire création');

// 3. Fermer via le bouton X
await page.locator('button').filter({ has: page.locator('svg') }).last().click();
await page.waitForTimeout(300);

// 4. Onglet structures
await page.locator('button', { hasText: /Structures/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'patients-03-structures.png' });
console.log('✓ onglet structures');

await browser.close();
console.log('Done.');
