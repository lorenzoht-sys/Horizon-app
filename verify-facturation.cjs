const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const page = await browser.newPage();

  await page.goto('http://localhost:5174');

  // Auth + données de test
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('mouvtrack_demo_cleared', 'true');
    localStorage.setItem('mouvtrack_factures', '[]');

    localStorage.setItem('settings_praticien', JSON.stringify({
      nom: 'Clavier', prenom: 'Pierre', siret: '12345678912345',
      numeroSAP: 'fsfqsffqf', tarifHoraire: '45', prefixeFacture: 'FACT',
      prochainNumeroFacture: '1', adresseRue: '8 AV DU MAL DE LATTRE DE TASSIGNY',
      adresseCodePostal: '44400', adresseVille: 'Rezé',
      telephone: '0624663603', email: 'lorenzo.huet@gmail.com',
    }));

    localStorage.setItem('mouvtrack_participants', JSON.stringify([
      { id: 'vp1', nom: 'Martin', prenom: 'Sophie', dateNaissance: '1952-01-01',
        dateCreation: '2026-01-01', tags: [], adresseRue: '3 rue du Test',
        adresseCodePostal: '44400', adresseVille: 'Rezé' },
      { id: 'vp2', nom: 'Dupont', prenom: 'Jean', dateNaissance: '1960-05-10',
        dateCreation: '2026-01-01', tags: [], adresseRue: '7 allée Verte',
        adresseCodePostal: '44200', adresseVille: 'Nantes' },
    ]));

    const seances = [];
    ['2026-05-05','2026-05-08','2026-05-12'].forEach(d => seances.push({
      id: crypto.randomUUID(), participantId: 'vp1', date: d,
      heureDebut: '10:00', heureFin: '11:00', dureeMinutes: 60,
      type: 'seance', statut: 'realisee', adresse: '3 rue du Test'
    }));
    ['2026-05-06','2026-05-09'].forEach(d => seances.push({
      id: crypto.randomUUID(), participantId: 'vp2', date: d,
      heureDebut: '14:00', heureFin: '15:00', dureeMinutes: 60,
      type: 'seance', statut: 'realisee', adresse: '7 allée Verte'
    }));
    localStorage.setItem('mouvtrack_seances', JSON.stringify(seances));
  });

  await page.goto('http://localhost:5174/facturation');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'verify-1-generer.png' });
  console.log('📸 1 — onglet Générer');

  const text1 = await page.locator('body').innerText();
  console.log('Sophie Martin visible:', text1.includes('Sophie') ? 'OUI ✅' : 'NON ❌');
  console.log('Jean Dupont visible:', text1.includes('Dupont') ? 'OUI ✅' : 'NON ❌');

  const btn = page.locator('button').filter({ hasText: /^Générer/ }).last();
  const disabled = await btn.isDisabled().catch(() => true);
  console.log('Bouton Générer désactivé:', disabled ? 'OUI ❌' : 'NON ✅');

  if (!disabled) {
    await btn.click();
    await page.waitForTimeout(2000);
  }

  const raw = await page.evaluate(() => localStorage.getItem('mouvtrack_factures'));
  const nb = raw ? JSON.parse(raw).length : 0;
  console.log(`localStorage après clic: ${nb} facture(s)`, nb > 0 ? '✅' : '❌ VIDE');

  await page.screenshot({ path: 'verify-2-apres-clic.png' });
  console.log('📸 2 — après clic Générer');

  const text2 = await page.locator('body').innerText();
  console.log('Historique affiche Sophie:', text2.includes('Sophie') ? 'OUI ✅' : 'NON ❌');
  console.log('Historique affiche Dupont:', text2.includes('Dupont') ? 'OUI ✅' : 'NON ❌');

  await page.screenshot({ path: 'verify-3-historique.png' });
  console.log('📸 3 — onglet Historique');

  await browser.close();
})();
