import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

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

    // Date de naissance : OBLIGATOIRE et vérifiée AVANT le consentement
    // (ParticipantForm.tsx, handleSubmit → validerDateNaissance). Sans elle, « Créer
    // la fiche » affiche « La date de naissance est obligatoire. » et jamais le
    // message RGPD attendu plus bas : le test ne prouvait donc pas le blocage RGPD.
    await page.getByPlaceholder('JJ/MM/AAAA', { exact: true }).fill('15/03/1955');

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

    let participantId: string | null = null;
    try {
      // Consentement RGPD : BLOQUANT à la création depuis le 2026-09-13
      // (src/lib/consentementRgpd.ts). Sans lui, « Créer la fiche » ne crée rien
      // et affiche le message — vérifié avant de cocher, sinon ce test ne
      // prouverait pas que le blocage existe.
      await page.getByRole('button', { name: 'Créer la fiche' }).click();
      await expect(page.getByText(/consentement RGPD du bénéficiaire est obligatoire/)).toBeVisible();
      await expect(page).toHaveURL(/\/participants\/nouveau$/);

      await page.getByLabel('Le bénéficiaire a été informé et a consenti').check();
      await page.getByRole('button', { name: 'Créer la fiche' }).click();

      await expect(page.getByText(`${prenom} ${nom} ajouté(e) !`)).toBeVisible();
      await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
      participantId = page.url().match(/\/participant\/([0-9a-fA-F-]+)$/)?.[1] ?? null;
    } finally {
      // Bénéficiaire dédié à ce test (pas un bénéficiaire partagé comme
      // Camille/Julien) : suppression complète, cascade base (bilans,
      // programmes, contrats) comme le fait deleteParticipant()
      // (useParticipants.ts) — jamais atteinte si l'assertion RGPD ou la
      // création elle-même échoue avant, d'où `participantId` capturé au
      // dernier moment possible plutôt que déduit de l'URL a priori.
      const admin = clientAdminTest();
      if (admin && participantId) {
        await admin.from('participants').delete().eq('id', participantId);
      }
    }
  });
});
