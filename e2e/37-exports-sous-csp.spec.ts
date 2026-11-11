import { test, expect, type Page } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from './helpers.js';

// Exports et imports qui reposent sur une bibliothèque tierce chargée dans le
// navigateur. Ajouté le 2026-11-11 avec le passage de la CSP du mode
// « Report-Only » au mode appliqué (PR #184) : le premier essai avait bloqué
// le WebAssembly puis les workers du générateur de la fiche bilan, seul export
// alors couvert (04-export-pdf-bilan). Chaque test vérifie le résultat ET
// l'absence de violation de la CSP dans la console.
//
// | Parcours                         | Bibliothèque          |
// | -------------------------------- | --------------------- |
// | Export / import Excel            | xlsx                  |
// | Compte-rendu PDF de l'assistant  | pdfmake               |
//
// Le rapport d'évolution (html2canvas + jspdf) est vérifié dans
// mobile/25-comparaison-evolution-mobile, seul test à garantir les 2 bilans
// qu'il exige.
//
// Aucune écriture en base : l'import lit un fichier sans ligne de données,
// la réponse de l'IA et l'écriture du journal de l'assistant sont simulées.

/** Relève les violations de la CSP. La barre d'outils Vercel (vercel.live),
 *  injectée sur les Preview et absente en production, est ignorée. */
function surveillerCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', msg => {
    const texte = msg.text();
    if (/Content Security Policy/i.test(texte) && !/vercel\.live/.test(texte)) violations.push(texte);
  });
  return violations;
}

test.describe('Exports et imports sous CSP appliquée', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('export Excel puis lecture d\'un fichier importé', async ({ page }) => {
    const violations = surveillerCsp(page);
    await loginPraticien(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Import Excel' }).click();

    const telechargement = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: /Exporter tous mes bénéficiaires en Excel/ }).click();
    expect((await telechargement).suggestedFilename()).toMatch(/\.xlsx$/);

    // Fichier réduit à sa ligne d'en-tête : la bibliothèque le lit en entier,
    // mais aucune ligne n'est à insérer.
    await page.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles({
      name: 'import-vide.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Nom;Prénom;Date de naissance\n', 'utf-8'),
    });
    await expect(page.getByText('Import terminé')).toBeVisible({ timeout: 15000 });
    expect(violations).toEqual([]);
  });

  test('compte-rendu PDF de l\'assistant', async ({ page }) => {
    const violations = surveillerCsp(page);
    await page.route('**/api/claude', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: '# Compte-rendu\n\n## Synthèse\n\nTexte **fictif** de test.\n\n- point un\n- point deux\n' }),
    }));
    // Le journal de l'assistant n'est pas écrit : un run e2e ne doit pas
    // laisser de ligne dans assistant_logs.
    await page.route('**/rest/v1/assistant_logs*', route =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 201, contentType: 'application/json', body: '' })
        : route.continue());

    await loginPraticien(page);
    await page.goto('/assistant');
    await page.getByText('Rédiger un compte-rendu', { exact: true }).click();
    await page.getByRole('button', { name: /Médecin prescripteur/ }).click();

    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    const recherche = page.getByPlaceholder('Rechercher un bénéficiaire…');
    const choix = page.getByRole('button', { name: new RegExp(nomComplet) }).first();
    await expect(recherche.or(choix).first()).toBeVisible({ timeout: 20000 });
    if (await recherche.isVisible()) await recherche.fill(nomComplet);
    await choix.click();

    const boutonPdf = page.getByRole('button', { name: /Télécharger en PDF/ });
    await expect(boutonPdf).toBeVisible({ timeout: 20000 });
    const telechargement = page.waitForEvent('download', { timeout: 30000 });
    await boutonPdf.click();
    expect((await telechargement).suggestedFilename()).toMatch(/^CR-medecin_.*\.pdf$/);
    expect(violations).toEqual([]);
  });
});
