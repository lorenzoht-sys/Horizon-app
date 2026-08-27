import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

test.describe('Création d\'un participant', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer une nouvelle fiche participant', async ({ page }) => {
    await loginPraticien(page);

    await page.goto('/participants/nouveau');

    const prenom = 'Test';
    const nom = `E2E${Date.now()}`;

    // `exact: true` : sans lui, 'Jean' correspond aussi au placeholder
    // 'jean@email.com' du champ email (correspondance partielle, insensible
    // à la casse) et Playwright refuse l'ambiguïté en mode strict.
    await page.getByPlaceholder('Jean', { exact: true }).fill(prenom);
    await page.getByPlaceholder('Dupont', { exact: true }).fill(nom);

    // Stepper en 5 étapes. La fréquence des séances est OBLIGATOIRE à la
    // création depuis `validerOrganisation()` (ParticipantForm.tsx:1230) :
    // sans elle, `submit()` renvoie une erreur, le stepper revient à
    // l'étape 4 et aucune fiche n'est créée. Ce test partait encore du
    // principe qu'aucun champ n'était requis avant l'étape finale.
    // Cliquer l'option renseigne d'un coup nbSeancesSemaine ET la durée de
    // chaque séance (45 min par défaut).
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Suivant →' }).click();
    }
    await page.getByRole('button', { name: '1 séance/semaine', exact: true }).click();
    await page.getByRole('button', { name: 'Suivant →' }).click();

    await page.getByRole('button', { name: 'Créer la fiche' }).click();

    await expect(page.getByText(`${prenom} ${nom} ajouté(e) !`)).toBeVisible();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
  });
});
