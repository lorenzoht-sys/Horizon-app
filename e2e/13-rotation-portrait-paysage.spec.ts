import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

// Sous 768 px l'espace pro affiche l'interface mobile, au-dessus l'interface
// desktop (App.tsx). Le praticien tourne VOLONTAIREMENT son téléphone pour
// atteindre les écrans desktop : la bascule est voulue, la perte de la saisie
// en cours ne l'est pas.
const PORTRAIT = { width: 390, height: 844 };
const PAYSAGE = { width: 844, height: 390 };
const CLE_BROUILLON_CREATION = 'participant_brouillon_nouveau';

test.describe('Rotation portrait ↔ paysage', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test.afterEach(async ({ page }) => {
    // Ne pas laisser de brouillon pour les tests suivants (02-creation-patient).
    await page.evaluate(cle => localStorage.removeItem(cle), CLE_BROUILLON_CREATION).catch(() => {});
  });

  test('la saisie d’un nouveau bénéficiaire survit à la rotation, dans les deux sens', async ({ page }) => {
    await loginPraticien(page);
    await page.setViewportSize(PORTRAIT);
    await page.goto('/participants/nouveau');

    const nom = `Rotation${Date.now()}`;
    // Formulaire mobile : placeholder « Dupont » comme le formulaire complet.
    await page.getByPlaceholder('Dupont', { exact: true }).fill(nom);

    // Paysage : même URL, formulaire complet, saisie reprise.
    await page.setViewportSize(PAYSAGE);
    await expect(page.getByRole('button', { name: 'Suivant →' })).toBeVisible();
    await expect(page.getByPlaceholder('Dupont', { exact: true })).toHaveValue(nom);

    // Retour en portrait : formulaire mobile, saisie toujours là.
    await page.setViewportSize(PORTRAIT);
    await expect(page.getByRole('button', { name: /Créer le bénéficiaire/ })).toBeVisible();
    await expect(page.getByPlaceholder('Dupont', { exact: true })).toHaveValue(nom);
  });

  test('le consentement reste obligatoire pour un brouillon mobile rouvert en paysage', async ({ page }) => {
    await loginPraticien(page);
    await page.setViewportSize(PORTRAIT);
    await page.goto('/participants/nouveau');
    await page.getByPlaceholder('Marie', { exact: true }).fill('Test');
    await page.getByPlaceholder('Dupont', { exact: true }).fill(`Rgpd${Date.now()}`);

    await page.setViewportSize(PAYSAGE);
    // Obligatoire depuis la fermeture du trou « date de naissance jamais
    // vérifiée dans l'assistant par étapes » (bug 03, docs/PLAN-BETA.md) :
    // sans elle, submit() bloque ici avec un message différent et le test
    // ne peut jamais atteindre la vérification du consentement RGPD visée.
    await page.getByPlaceholder('JJ/MM/AAAA').fill('12/05/1957');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: '1 séance/semaine', exact: true }).click();
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: 'Créer la fiche' }).click();

    await expect(page.getByText(/consentement RGPD du bénéficiaire est obligatoire/)).toBeVisible();
    await expect(page).toHaveURL(/\/participants\/nouveau$/);
  });
});
