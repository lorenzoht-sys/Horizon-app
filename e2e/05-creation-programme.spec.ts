import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

test.describe('Création d\'un programme', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un programme et le partager avec un participant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);

    await page.goto(`${page.url()}/programme`);

    await page.getByRole('button', { name: 'Créer un programme' }).first().click();

    // Étape 1/4 — seul le nom est requis pour avancer. Titre horodaté :
    // seul identifiant disponible pour retrouver la ligne créée ensuite
    // (l'UI ne redirige jamais vers une URL contenant son id).
    const titreProgramme = `Programme E2E ${Date.now()}`;
    await page.getByPlaceholder('ex: Programme Équilibre').fill(titreProgramme);

    try {
      // Étapes 2/4 (Séances) et 3/4 (Planning) : optionnelles, "Suivant" sans blocage.
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: /Suivant/ }).click();
      }

      // Étape 4/4 — Récapitulatif.
      await page.getByRole('button', { name: '✅ Sauvegarder et partager' }).click();

      // « patient » est devenu « bénéficiaire » dans l'interface
      // (ProgrammePage.tsx:999) sans que ce test suive.
      await expect(page.getByText('Programme créé et partagé avec le bénéficiaire !')).toBeVisible();
    } finally {
      // Julien Bernard est un bénéficiaire PARTAGÉ (utilisé par d'autres
      // tests) : on ne supprime que CE programme, retrouvé par son titre
      // horodaté unique — jamais tout le bénéficiaire. Sans ce filet, 157
      // programmes orphelins s'étaient accumulés (trouvaille du chantier
      // "Programme — appliquer un modèle", nettoyés séparément).
      const admin = clientAdminTest();
      if (admin) {
        const { data } = await admin.from('programmes').select('id').eq('titre', titreProgramme).limit(1);
        if (data?.[0]?.id) await admin.from('programmes').delete().eq('id', data[0].id);
      }
    }
  });
});
