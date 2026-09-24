import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from '../helpers.js';

// Chantier « wizard manuel simplifié (mobile) », sous-chantier 1 : extraction
// de useProgrammeWizard() (ProgrammePage.tsx / ModelesProgrammePage.tsx) puis
// UI mobile pour les étapes 1/3/4 (formulaires simples). L'étape 2 (choix des
// exercices, ExercicePickerModal) reste desktop-only pour l'instant — testée
// ici comme un message "pas encore disponible", pas un blocage.
//
// Avant ce chantier, le bouton "Créer un programme" de la fiche mobile
// naviguait vers /participant/:id/programme (desktop-only, hors route
// fusionnée) : sur mobile, ça retombait sur l'invitation "tournez votre
// téléphone" — un praticien ne pouvait tout simplement pas créer de
// programme depuis son téléphone. Corrigé en ouvrant le wizard directement
// sur la fiche (ParticipantProfile.tsx), comme pour "Utiliser un modèle"
// (chantier précédent, 22-programme-appliquer-modele-mobile.spec.ts).

test.describe('Création de programme — wizard mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un programme depuis la fiche mobile, sans exercice', async ({ page }) => {
    test.setTimeout(60000);
    const prenomP = 'E2E';
    const nomP = `Wizard${Date.now()}`;
    const titreProgramme = `Programme E2E wizard mobile ${Date.now()}`;

    await loginPraticien(page);

    // ── Bénéficiaire de test dédié, côté desktop (stepper 5 étapes) ──────
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/participants/nouveau');
    await page.getByPlaceholder('Jean', { exact: true }).fill(prenomP);
    await page.getByPlaceholder('Dupont', { exact: true }).fill(nomP);
    await page.getByPlaceholder('JJ/MM/AAAA', { exact: true }).fill('15/03/1955');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Suivant →' }).click();
    }
    await page.getByRole('button', { name: '1 séance/semaine', exact: true }).click();
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.getByLabel('Le bénéficiaire a été informé et a consenti').check();
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/, { timeout: 15000 });
    const participantUrl = page.url();

    try {
      // ── Wizard depuis la fiche mobile (390×844) ─────────────────────────
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');

      const urlAvant = page.url();
      await page.getByRole('button', { name: 'Créer un programme' }).click();

      // Étape 1/4 — infos générales.
      await expect(page.getByText('Étape 1/4')).toBeVisible();
      await page.getByPlaceholder('ex: Programme Équilibre').fill(titreProgramme);
      await page.getByRole('button', { name: /Suivant/ }).click(); // 1 → 2

      // Étape 2/4 — pas de sélecteur d'exercices sur mobile : message dédié,
      // jamais de blocage sans issue (on peut avancer sans exercice).
      await expect(page.getByText("Le choix des exercices n'est pas encore disponible sur mobile")).toBeVisible();
      await page.getByRole('button', { name: /Suivant/ }).click(); // 2 → 3

      // Étape 3/4 — planning (laissé vide, pas requis).
      await expect(page.getByText('Étape 3/4')).toBeVisible();
      await page.getByRole('button', { name: /Suivant/ }).click(); // 3 → 4

      // Étape 4/4 — récapitulatif puis sauvegarde.
      await expect(page.getByText('Étape 4/4')).toBeVisible();
      await page.getByRole('button', { name: '✅ Sauvegarder et partager' }).click();
      await expect(page.getByText('Programme créé et partagé avec le bénéficiaire !')).toBeVisible({ timeout: 10000 });

      // Pas de navigation : la modale se ferme, la fiche reste la même URL,
      // la carte "Programme en cours" apparaît en place (rechargement).
      expect(page.url(), 'aucune navigation attendue après création').toBe(urlAvant);
      await expect(page.getByText(titreProgramme)).toBeVisible({ timeout: 10000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'ne doit pas provoquer de défilement horizontal à 390px').toBe(false);

      await page.screenshot({ path: 'programme-wizard-mobile-390.png', fullPage: false });
    } finally {
      // ── Nettoyage : supprime le bénéficiaire de test (cascade programme) ─
      await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
      await page.goto(participantUrl).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.getByRole('button', { name: '···' }).click().catch(() => {});
      await page.locator('div.w-52').getByRole('button', { name: 'Supprimer', exact: true }).click().catch(() => {});
      await page.getByRole('button', { name: 'Supprimer définitivement' }).click().catch(() => {});
      await page.waitForURL(/\/($|\?)/, { timeout: 10000 }).catch(() => {});
    }
  });
});
