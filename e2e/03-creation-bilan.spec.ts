import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

test.describe('Création d\'un bilan', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un nouveau bilan pour un participant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom} ${env.patientNom}`);

    await page.getByRole('button', { name: '+ Nouveau bilan' }).click();
    await page.waitForURL(/\/bilan\/new$/);

    // Un brouillon d'une tentative précédente (locale — souvent la vôtre, en
    // développement — ou cloud, voir bilans_brouillons) peut proposer un
    // écran de reprise (ModalRepriseBrouillon) à la place du stepper : ce
    // test crée toujours un bilan neuf, jamais une reprise — même garde que
    // 19-bilan-detail-mobile.spec.ts et 25-comparaison-evolution-mobile.spec.ts.
    const recommencerBtn = page.getByRole('button', { name: /Recommencer/ });
    const dateInput = page.locator('input[type="date"]');
    await Promise.race([
      recommencerBtn.waitFor({ state: 'visible', timeout: 30000 }),
      dateInput.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    if (await recommencerBtn.isVisible().catch(() => false)) {
      await recommencerBtn.click();
      await dateInput.waitFor({ timeout: 20000 });
    }

    let bilanId: string | null = null;
    try {
      // Camille a déjà un bilan initial : le nouveau bilan est "trimestriel"
      // (5 étapes, "Suivant →" sans validation bloquante).
      for (let i = 0; i < 4; i++) {
        await page.getByRole('button', { name: 'Suivant →' }).click();
      }

      await page.getByRole('button', { name: 'Enregistrer le bilan' }).click();

      await expect(page.getByText('Bilan enregistré !')).toBeVisible();
      await page.waitForURL(/\/participant\/[0-9a-fA-F-]+\/bilan\/[0-9a-fA-F-]+$/);
      bilanId = page.url().match(/\/bilan\/([0-9a-fA-F-]+)$/)?.[1] ?? null;
    } finally {
      // Camille est une bénéficiaire PARTAGÉE (utilisée par de nombreux
      // autres tests) : on ne supprime que CE bilan, jamais la fiche.
      // L'id est déjà connu (URL après enregistrement) — pas besoin de le
      // retrouver par recherche, contrairement au programme (05) qui n'a
      // pas d'URL portant son id.
      const admin = clientAdminTest();
      if (admin && bilanId) {
        await admin.from('bilans').delete().eq('id', bilanId);
      }
    }
  });
});
