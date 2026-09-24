import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Vérification de non-régression pour l'extraction de useProgrammeWizard()
// (ProgrammePage.tsx / ModelesProgrammePage.tsx) : le flux d'ÉDITION
// (openEditWizard) n'était couvert par AUCUN test avant ce chantier —
// 05-creation-programme.spec.ts ne teste que la création. Comble ce trou de
// couverture plutôt que de se fier à une vérification manuelle non répétable.

test.describe('Édition programme et modèle (wizard partagé)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut modifier un programme existant', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);
    await page.goto(`${page.url()}/programme`);

    const titreProgramme = `Programme E2E edit ${Date.now()}`;
    try {
      await page.getByRole('button', { name: 'Créer un programme' }).first().click();
      await page.getByPlaceholder('ex: Programme Équilibre').fill(titreProgramme);
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: /Suivant/ }).click();
      }
      await page.getByRole('button', { name: '✅ Sauvegarder et partager' }).click();
      await expect(page.getByText(titreProgramme)).toBeVisible();

      // Julien est un bénéficiaire PARTAGÉ : plusieurs cartes de programme
      // coexistent. useProgrammeV2 trie par created_at décroissant (le plus
      // récent en premier) — la carte tout juste créée est donc toujours la
      // première, sans ambiguïté avec les autres cartes déjà présentes.
      await expect(page.getByRole('button', { name: '✏️ Modifier' }).first()).toBeVisible();
      await page.getByRole('button', { name: '✏️ Modifier' }).first().click();

      const objectifModifie = `Objectif modifié ${Date.now()}`;
      await page.getByPlaceholder("ex: Améliorer l'équilibre et réduire le risque de chute").fill(objectifModifie);
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: /Suivant/ }).click();
      }
      await page.getByRole('button', { name: '✅ Enregistrer les modifications' }).click();
      await expect(page.getByText(objectifModifie)).toBeVisible();
    } finally {
      const admin = clientAdminTest();
      if (admin) {
        const { data } = await admin.from('programmes').select('id').eq('titre', titreProgramme).limit(1);
        if (data?.[0]?.id) await admin.from('programmes').delete().eq('id', data[0].id);
      }
    }
  });

  test('un praticien peut modifier un modèle de programme existant', async ({ page }) => {
    await loginPraticien(page);
    await page.goto('/bibliotheque');
    await page.getByRole('button', { name: 'Modèles de programme' }).click();

    const nomModele = `Modèle E2E edit ${Date.now()}`;
    try {
      await page.getByRole('button', { name: 'Créer un modèle' }).first().click();
      await page.getByPlaceholder('ex: Rééducation post-chute').fill(nomModele);
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: /Suivant/ }).click();
      }
      await page.getByRole('button', { name: '✅ Enregistrer le modèle' }).click();
      await expect(page.getByText(nomModele)).toBeVisible();

      // Même logique que pour les programmes : useProgrammesModeles trie
      // aussi par created_at décroissant, la carte créée à l'instant est en
      // première position.
      await expect(page.getByRole('button', { name: '✏️ Modifier' }).first()).toBeVisible();
      await page.getByRole('button', { name: '✏️ Modifier' }).first().click();

      const objectifModifie = `Objectif modifié ${Date.now()}`;
      await page.getByPlaceholder("ex: Améliorer l'équilibre et réduire le risque de chute").fill(objectifModifie);
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: /Suivant/ }).click();
      }
      await page.getByRole('button', { name: '✅ Enregistrer les modifications' }).click();
      await expect(page.getByText(objectifModifie)).toBeVisible();
    } finally {
      const admin = clientAdminTest();
      if (admin) {
        const { data } = await admin.from('programmes_modeles').select('id').eq('nom', nomModele).limit(1);
        if (data?.[0]?.id) await admin.from('programmes_modeles').delete().eq('id', data[0].id);
      }
    }
  });
});
