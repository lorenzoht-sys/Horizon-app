const { test, expect } = require('@playwright/test');

test('brouillon bilan — sauvegarde et reprise', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('onboarding_complete', 'true');
    // Supprimer tout brouillon existant pour demo-2
    localStorage.removeItem('brouillon_bilan_demo-2');
  });

  // 1. Ouvrir un nouveau bilan pour Jean-Pierre (demo-2)
  await page.goto('/participant/demo-2/bilan/new');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/loren/br_01_formulaire_vide.png' });

  // 2. Aller à l'étape suivante (étape 2)
  await page.getByRole('button', { name: /Suivant/i }).click();
  await page.waitForTimeout(600);

  // 3. Remplir quelques valeurs : équilibre droite
  const equilibreInput = page.locator('input[type="number"]').first();
  if (await equilibreInput.count() > 0) {
    await equilibreInput.fill('18');
  }
  await page.waitForTimeout(1200); // attendre l'autosave (debounce 800ms)
  await page.screenshot({ path: 'C:/Users/loren/br_02_apres_saisie.png' });

  // 4. Vérifier que le brouillon a été sauvegardé
  const brouillonSauve = await page.evaluate(() => {
    const raw = localStorage.getItem('brouillon_bilan_demo-2');
    if (!raw) return null;
    return JSON.parse(raw);
  });
  console.log('Brouillon sauvegardé:', brouillonSauve ? `étape ${brouillonSauve.etapeActuelle}, ${brouillonSauve.completionPct}%` : 'aucun');

  // 5. Naviguer ailleurs (simuler abandon)
  await page.goto('/');
  await page.waitForTimeout(500);

  // 6. Revenir sur nouveau bilan → doit afficher la modal de reprise
  await page.goto('/participant/demo-2/bilan/new');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'C:/Users/loren/br_03_modal_reprise.png' });

  // 7. Vérifier que la modal est affichée
  const modalTexte = await page.getByText(/Bilan en cours/i).count();
  console.log('Modal reprise visible:', modalTexte > 0);

  // 8. Cliquer "Reprendre"
  const boutonReprendre = page.getByRole('button', { name: /Reprendre le bilan/i });
  if (await boutonReprendre.count() > 0) {
    await boutonReprendre.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:/Users/loren/br_04_reprise_bilan.png' });
  }

  // 9. Vérifier le widget dashboard
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:/Users/loren/br_05_dashboard_widget.png' });
});
