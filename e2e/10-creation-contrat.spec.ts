import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Création d\'un contrat de suivi', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un contrat avec les valeurs par défaut', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);

    await page.goto(`${page.url()}/contrat/nouveau`);

    // Jours de séance OBLIGATOIRES, en nombre égal à la fréquence (validerNouveauContrat,
    // règle « jours_fixe obligatoire »). La fréquence par défaut est de 2 séances/semaine
    // et aucun jour n'est présélectionné : sans cette étape, « Créer le contrat » affiche
    // « Sélectionnez au moins un jour de séance. » et ne crée rien.
    const jours = page.getByText('Jours de séance *').locator('..');
    await jours.getByRole('button', { name: 'Lun', exact: true }).click();
    await jours.getByRole('button', { name: 'Jeu', exact: true }).click();

    await page.getByRole('button', { name: 'Créer le contrat et générer les séances' }).click();

    // Le contrat ne génère PLUS les séances automatiquement : la génération
    // est passée sur Tournée → Planifier, et le message de confirmation le dit
    // (ContratNouveauPage.tsx, toast après creerContrat).
    await expect(page.getByText(/Contrat créé\. Allez sur Tournée/)).toBeVisible();
  });
});
