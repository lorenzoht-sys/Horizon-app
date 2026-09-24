import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

test.describe('Création d\'un contrat de suivi', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un contrat avec les valeurs par défaut', async ({ page }) => {
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);
    const participantId = page.url().match(/\/participant\/([0-9a-fA-F-]+)$/)?.[1] ?? null;

    await page.goto(`${page.url()}/contrat/nouveau`);

    // Jours de séance OBLIGATOIRES, en nombre égal à la fréquence (validerNouveauContrat,
    // règle « jours_fixe obligatoire »). La fréquence par défaut est de 2 séances/semaine
    // et aucun jour n'est présélectionné : sans cette étape, « Créer le contrat » affiche
    // « Sélectionnez au moins un jour de séance. » et ne crée rien.
    const jours = page.getByText('Jours de séance *').locator('..');
    await jours.getByRole('button', { name: 'Lun', exact: true }).click();
    await jours.getByRole('button', { name: 'Jeu', exact: true }).click();

    try {
      await page.getByRole('button', { name: 'Créer le contrat et générer les séances' }).click();

      // Le contrat ne génère PLUS les séances automatiquement : la génération
      // est passée sur Tournée → Planifier, et le message de confirmation le dit
      // (ContratNouveauPage.tsx, toast après creerContrat).
      await expect(page.getByText(/Contrat créé\. Allez sur Tournée/)).toBeVisible();
    } finally {
      // Julien Bernard est un bénéficiaire PARTAGÉ : on ne supprime que CE
      // contrat. Son id est généré côté client (uuidv4, useContrats.ts) et
      // jamais exposé à l'UI (la page redirige vers la fiche, pas une URL
      // avec l'id du contrat) — retrouvé comme le plus récent pour ce
      // participant. 106 contrats orphelins avaient été repérés (trouvaille
      // du chantier "Programme — appliquer un modèle") avant ce filet.
      const admin = clientAdminTest();
      if (admin && participantId) {
        const { data } = await admin
          .from('contrats')
          .select('id')
          .eq('participant_id', participantId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (data?.[0]?.id) await admin.from('contrats').delete().eq('id', data[0].id);
      }
    }
  });
});
