import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

// Page « Mon tableau de bord » (/stats). Ajouté le 2026-11-11 : la page
// n'avait aucun test alors que ses trois graphiques changeaient de
// bibliothèque (chart.js → recharts, PR #174). Le test ne dépend pas de la
// bibliothèque : il vérifie que des graphiques sont tracés, qu'aucune erreur
// n'est levée, et joint une capture de la page au rapport pour un contrôle
// visuel (artefact « playwright-resultats » de la CI).
test.describe('Tableau de bord du praticien', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('les graphiques se tracent sans erreur', async ({ page }, testInfo) => {
    const erreurs: string[] = [];
    page.on('pageerror', err => erreurs.push(err.message));
    page.on('console', msg => {
      const texte = msg.text();
      if (/Content Security Policy/i.test(texte) && !/vercel\.live/.test(texte)) erreurs.push(texte);
    });

    await loginPraticien(page);
    await page.goto('/stats');
    await expect(page.getByRole('heading', { name: 'Mon tableau de bord' })).toBeVisible({ timeout: 20000 });

    // chart.js trace dans un <canvas>, recharts dans un <svg class="recharts-surface">.
    const graphiques = page.locator('canvas, svg.recharts-surface');
    await expect(graphiques.first()).toBeVisible({ timeout: 20000 });
    expect(await graphiques.count()).toBeGreaterThanOrEqual(2);
    for (const boite of await graphiques.evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(r => ({ l: r.width, h: r.height })))) {
      expect(boite.l, 'un graphique a une largeur nulle').toBeGreaterThan(50);
      expect(boite.h, 'un graphique a une hauteur nulle').toBeGreaterThan(50);
    }

    await page.waitForLoadState('networkidle');
    // Une capture par graphique, écrite dans test-results/ (le dossier que la CI
    // conserve). La page défile dans un conteneur interne : une capture « pleine
    // page » ne montrerait que le haut, sans aucun graphique.
    for (let i = 0; i < await graphiques.count(); i++) {
      await graphiques.nth(i).scrollIntoViewIfNeeded();
      const capture = testInfo.outputPath(`graphique-${i + 1}.png`);
      await page.screenshot({ path: capture });
      await testInfo.attach(`graphique-${i + 1}.png`, { path: capture, contentType: 'image/png' });
    }
    expect(erreurs).toEqual([]);
  });
});
