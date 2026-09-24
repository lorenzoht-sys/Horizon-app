import { test, expect } from '@playwright/test';
import { skipUnlessE2E, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

test.describe('Séance du jour — coche d\'exercice', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un patient peut faire sa séance du jour et l\'enregistrer', async ({ page }) => {
    await page.goto('/patient');
    await page.getByPlaceholder('Entrez votre code…').fill(env.patientCode);
    await page.getByRole('button', { name: /Accéder à mon espace/ }).click();
    await page.waitForURL(/\/patient\/[0-9a-fA-F-]+$/);
    const participantId = page.url().match(/\/patient\/([0-9a-fA-F-]+)$/)?.[1] ?? null;

    try {
      await page.getByRole('button', { name: /Programme/ }).click();
      await page.getByRole('button', { name: '▶️ COMMENCER LA SÉANCE' }).first().click();

      // Coche chaque exercice jusqu'à l'écran de fin (le nombre d'exercices
      // dépend de la séance planifiée, donc boucle bornée plutôt qu'un nombre fixe).
      for (let i = 0; i < 10; i++) {
        if (await page.getByText('Séance terminée !').isVisible()) break;
        await page.getByRole('button', { name: "✅ J'ai fait cet exercice" }).click();
      }

      await expect(page.getByText('Séance terminée !')).toBeVisible();

      await page.getByRole('button', { name: '💾 Valider et enregistrer' }).click();

      await expect(page.getByText('Séance terminée !')).not.toBeVisible();
    } finally {
      // Écrit côté session PATIENT (api/patient/seance.ts, seances_patient +
      // exercices_realises) — aucune affordance de suppression côté
      // praticien ni côté patient : filet direct en base, seule option ici.
      // Une contrainte d'unicité (participant_id, date_seance) fait échouer
      // toute exécution suivante LE MÊME JOUR sans ce nettoyage ("Vous avez
      // déjà validé cette séance aujourd'hui.", api/patient/seance.ts) —
      // au-delà de l'accumulation, ce filet évite aussi ce blocage.
      const admin = clientAdminTest();
      if (admin && participantId) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: sp } = await admin
          .from('seances_patient')
          .select('id')
          .eq('participant_id', participantId)
          .eq('date_seance', today);
        if (sp?.length) {
          const ids = sp.map(s => s.id);
          await admin.from('exercices_realises').delete().in('seance_patient_id', ids);
          await admin.from('seances_patient').delete().in('id', ids);
        }
      }
    }
  });
});
