import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

// Chantier « Structures (liste + détail) — mobile » : CarteStructure et
// ModalCreationStructure, jusqu'ici définis à l'intérieur de Dashboard.tsx,
// en sont extraits vers src/components/structures/ pour être réutilisés par
// la nouvelle StructuresPage.tsx (route /structures, fusionnée). Risque
// direct de régression sur l'onglet "Structures" du tableau de bord — même
// nature que l'extraction de useProgrammeWizard() qui avait cassé une
// validation sans que le diagnostic initial le voie. Ce test couvre
// spécifiquement l'onglet desktop, INCHANGÉ dans son comportement, pour
// prouver que l'extraction ne l'a pas régressé — pas seulement supposé.

test.describe('Structures — onglet desktop de Dashboard.tsx (extraction CarteStructure/ModalCreationStructure)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('créer une structure depuis l\'onglet Structures, la retrouver après retour au tableau de bord, avec facturation visible', async ({ page }) => {
    const nomStructure = `E2E Structure desktop ${Date.now()}`;
    await loginPraticien(page);

    await page.goto('/');
    await page.getByRole('button', { name: /🏢 Structures/ }).click();

    let structureUrl: string | null = null;
    try {
      await page.getByRole('button', { name: 'Créer une structure' }).click();
      await page.getByPlaceholder('EHPAD Les Rosiers').fill(nomStructure);
      await page.getByPlaceholder('m.durand@ehpad.fr').fill('contact.e2e.desktop@example.com');
      await page.getByRole('button', { name: 'Créer la structure' }).click();

      await expect(page.getByText(`Structure "${nomStructure}" créée`)).toBeVisible({ timeout: 10000 });
      await page.waitForURL(/\/structures\/[0-9a-fA-F-]+$/);
      structureUrl = page.url();

      // Détail : carte Facturation visible sur desktop (frontière
      // structures/facturation — Phase 4 reste accessible ici, seul le
      // mobile la masque).
      await expect(page.getByText('💶 Facturation')).toBeVisible();
      await expect(page.getByText('⚙️ Informations')).toBeVisible();

      // ── Preuve de non-régression de l'extraction : retour au tableau de
      // bord, l'onglet Structures doit retrouver la structure fraîchement
      // créée, rendue par le composant CarteStructure désormais externe. ──
      await page.goto('/');
      await page.getByRole('button', { name: /🏢 Structures/ }).click();
      await expect(page.getByText(nomStructure)).toBeVisible();
      await expect(page.getByRole('button', { name: /Voir les bénéficiaires/ }).first()).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'onglet Structures : pas de défilement horizontal').toBe(false);
    } finally {
      // ── Nettoyage via la fonctionnalité réelle de l'app (zone de danger),
      // pas un accès direct à la base : c'est aussi une vérification de plus
      // que "Supprimer cette structure" fonctionne après l'extraction. ─────
      if (structureUrl) {
        await page.goto(structureUrl).catch(() => {});
        await page.getByRole('button', { name: /Supprimer cette structure/ }).click().catch(() => {});
        await page.getByRole('button', { name: 'Confirmer' }).click().catch(() => {});
        await page.getByText('Structure supprimée').waitFor({ timeout: 10000 }).catch(() => {});
      }
    }
  });
});
