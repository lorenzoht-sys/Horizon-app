import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';

test.describe('Rappels automatiques - réglages praticien', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut modifier les réglages globaux de rappels', async ({ page }) => {
    await loginPraticien(page);
    await page.goto('/settings');

    const section = page.locator('section').filter({ hasText: '🔔 Rappels automatiques' });
    await expect(section).toBeVisible();

    const champDelai = section.locator('input[type="number"]').first();
    const valeurInitiale = await champDelai.inputValue();
    await champDelai.fill('5');

    await section.getByRole('button', { name: /Enregistrer les rappels/ }).click();
    await expect(page.getByText('Préférences de rappels enregistrées')).toBeVisible();

    // On remet la valeur initiale pour ne pas polluer les autres tests.
    await champDelai.fill(valeurInitiale);
    await section.getByRole('button', { name: /Enregistrer les rappels/ }).click();
    await expect(page.getByText('Préférences de rappels enregistrées')).toBeVisible();
  });

  test('le praticien voit l\'état des rappels sur la fiche patient et peut le personnaliser', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom} ${env.patientNom}`);

    await page.getByRole('button', { name: '🔔 Rappels' }).click();

    // Indicateur du nombre d'appareils abonnés (0 ou plus).
    await expect(page.getByText(/appareil.*abonné/)).toBeVisible();

    // Personnalise les réglages pour ce patient (ou les ré-enregistre s'il
    // existait déjà une surcharge).
    // Le libellé dépend de l'état : « Personnaliser pour ce bénéficiaire »
    // quand le patient hérite des réglages globaux, « Enregistrer » quand il
    // a déjà une surcharge (ParticipantProfile.tsx:934). « patient » y est
    // devenu « bénéficiaire » sans que ce test suive.
    await page.getByRole('button', { name: /Personnaliser pour ce bénéficiaire|^Enregistrer$/ }).click();
    await expect(page.getByText('Préférences de rappels enregistrées')).toBeVisible();

    // Nettoyage : on revient aux réglages globaux pour ne pas laisser de
    // surcharge sur le patient de démo.
    const revenirBtn = page.getByRole('button', { name: 'Revenir aux réglages globaux' });
    await revenirBtn.click();
    await expect(page.getByText('Réglages globaux rétablis pour ce patient')).toBeVisible();
  });
});
