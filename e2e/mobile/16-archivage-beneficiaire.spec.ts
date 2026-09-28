import { test, expect, type Page } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';

// Chantier fusion /archives (mobile) : /archives est désormais une route
// fusionnée (estRouteInterfaceUnique, src/lib/routesMobile.ts), servie par
// ArchivesPage directement comme /participant/:id. Ce test archive un
// bénéficiaire depuis sa fiche mobile, vérifie qu'il apparaît dans
// /archives, le désarchive depuis la page elle-même (ArchivesPage.tsx,
// bouton « Désarchiver / Réactiver »), et vérifie son retour dans la liste
// active — le point d'accès depuis l'onglet « Plus » (EcranPlus,
// AppMobile.tsx) sert à y naviguer.
//
// Utilise Julien (E2E_PATIENT_CODE_2), pas Camille : Julien n'a ni bilan ni
// programme (voir e2e/README.md), donc rien à nettoyer hors l'état
// d'archivage lui-même — désarchivé dans un `finally`, pour que 05/08/10
// (specs desktop qui dépendent de lui) restent utilisables même si une
// assertion échoue ici en cours de route.
//
// Limite connue : ce nettoyage reste piloté par l'UI (comme le reste de la
// suite, voir e2e/helpers.ts). Un crash du navigateur en plein milieu du
// test laisserait Julien archivé — à vérifier manuellement (page /archives)
// si ce test s'interrompt anormalement plutôt que d'échouer proprement.

function barreNav(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

test.describe('Archivage d\'un bénéficiaire (mobile, /archives fusionnée)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('archiver depuis la fiche, retrouver dans /archives, désarchiver, retrouver dans la liste active', async ({ page }) => {
    const nomComplet = `${env.patientPrenom2} ${env.patientNom2}`;
    await loginPraticien(page);

    try {
      // ── Archiver depuis la fiche mobile ──────────────────────────────
      await barreNav(page).getByRole('button', { name: 'Bénéfic.' }).click();
      await page.getByText(nomComplet).first().click();
      await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);

      await page.getByRole('button', { name: '···' }).click();
      await page.getByRole('button', { name: 'Archiver' }).click();
      await expect(page.getByText(/archivé\(e\)\. Retrouvez-le dans/)).toBeVisible({ timeout: 10000 });

      // ── Point d'accès mobile vers /archives (EcranPlus) ──────────────
      await barreNav(page).getByRole('button', { name: 'Plus' }).click();
      await page.getByRole('button', { name: /Bénéficiaires archivés/ }).click();
      await expect(page).toHaveURL(/\/archives$/);

      // Route fusionnée : ArchivesPage directement, même que sur desktop.
      await expect(page.getByText(nomComplet).first()).toBeVisible();
      await expect(barreNav(page)).toBeVisible();

      // ── Désarchiver depuis la page elle-même ─────────────────────────
      await page.getByRole('button', { name: `Désarchiver / Réactiver ${nomComplet}` }).click();
      await expect(page.getByText(/de nouveau parmi les bénéficiaires actifs/)).toBeVisible({ timeout: 10000 });
    } finally {
      // Filet de sécurité : si une assertion ci-dessus a échoué avant le
      // désarchivage, on retente ici plutôt que de laisser Julien archivé.
      await page.goto('/archives').catch(() => {});
      const carteEncoreArchivee = page.getByText(nomComplet).first();
      if (await carteEncoreArchivee.isVisible().catch(() => false)) {
        await page
          .getByRole('button', { name: `Désarchiver / Réactiver ${nomComplet}` })
          .click()
          .catch(() => {});
      }
    }

    // ── Retour dans la liste active ────────────────────────────────────
    await barreNav(page).getByRole('button', { name: 'Bénéfic.' }).click();
    await expect(page.getByText(nomComplet).first()).toBeVisible();
  });
});
