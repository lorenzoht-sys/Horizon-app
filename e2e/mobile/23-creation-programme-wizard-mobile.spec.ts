import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from '../helpers.js';

// Chantier « wizard manuel simplifié (mobile) » : sous-chantier 1 (extraction
// de useProgrammeWizard(), UI mobile Steps 1/3/4) livré dans une PR
// précédente. Ce test couvre en plus Step 2 (ExercicePickerModal), ajouté
// dans le sous-chantier suivant : recherche/filtrage dans la bibliothèque,
// ajout d'un exercice depuis la bibliothèque, création manuelle d'un
// exercice, suppression — le tout à 390px.
//
// Avant le premier sous-chantier, le bouton "Créer un programme" de la
// fiche mobile naviguait vers /participant/:id/programme (desktop-only,
// hors route fusionnée) : sur mobile, ça retombait sur l'invitation
// "tournez votre téléphone" — un praticien ne pouvait tout simplement pas
// créer de programme depuis son téléphone. Corrigé en ouvrant le wizard
// directement sur la fiche (ParticipantProfile.tsx), comme pour "Utiliser
// un modèle" (22-programme-appliquer-modele-mobile.spec.ts).

test.describe('Création de programme — wizard mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un programme avec exercices depuis la fiche mobile', async ({ page }) => {
    test.setTimeout(60000);
    const prenomP = 'E2E';
    const nomP = `Wizard${Date.now()}`;
    const titreProgramme = `Programme E2E wizard mobile ${Date.now()}`;
    const nomExerciceManuel = `Exercice manuel E2E ${Date.now()}`;

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

      // Étape 2/4 — bloc de séance + exercices (bibliothèque et manuel).
      await expect(page.getByText('Étape 2/4')).toBeVisible();
      await page.getByRole('button', { name: 'Ajouter un bloc de séance' }).click();
      await page.getByRole('button', { name: 'Ajouter un exercice' }).click();

      // Onglet Bibliothèque : recherche puis ajout.
      await expect(page.getByText('Ajouter un exercice').first()).toBeVisible();
      await page.getByPlaceholder('Rechercher un exercice...').fill('équilibre');
      const premiereCarte = page.getByRole('button', { name: '+ Ajouter' }).first();
      await expect(premiereCarte).toBeVisible();
      await premiereCarte.click();
      await expect(page.getByRole('button', { name: '✓ Ajouté' }).first()).toBeVisible();

      // Onglet Créer manuellement : ajout d'un second exercice. Le picker
      // reste monté par-dessus Step2 (l'exercice déjà ajouté à l'étape 2 a
      // le même placeholder) — .last() cible le champ du picker, monté
      // après dans le DOM.
      await page.getByRole('button', { name: /Créer manuellement/ }).click();
      await page.getByPlaceholder("Nom de l'exercice *").last().fill(nomExerciceManuel);
      // "Ajouter au bloc" ferme le picker directement (onAddManual met
      // pickerFor à null) — pas de bouton "Fermer" séparé sur cet onglet.
      await page.getByRole('button', { name: 'Ajouter au bloc' }).click();

      // Les deux exercices apparaissent dans le bloc — le nom est la VALEUR
      // d'un <input>, pas du texte (getByText ne matche pas les value).
      const champsNom = page.locator('input[placeholder="Nom de l\'exercice *"]');
      await expect(champsNom).toHaveCount(2);
      await expect(champsNom.last()).toHaveValue(nomExerciceManuel);

      // Suppression : retire l'exercice manuel, un seul doit rester.
      // `exact: true` exclut "Supprimer ce bloc" (bouton du bloc de séance,
      // même préfixe) — seuls les boutons de suppression d'exercice
      // (title="Supprimer" exact) doivent matcher.
      await page.getByRole('button', { name: 'Supprimer', exact: true }).last().click();
      await expect(champsNom).toHaveCount(1);

      const overflowStep2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflowStep2, 'étape 2 : pas de défilement horizontal à 390px').toBe(false);

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
