import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Chantier « contrats — création » : /participant/:id/contrat/nouveau rejoint
// estRouteInterfaceUnique (src/lib/routesMobile.ts). La route tombait jusqu'ici
// sur l'écran « pas encore de version téléphone » — un praticien ne pouvait
// donc pas créer de contrat depuis son téléphone, alors que la fiche propose
// trois entrées vers cet écran (bouton « Contrat », carte « Aucun contrat
// actif », onglet Contrats), toutes déjà fusionnées.
//
// Contrairement au diagnostic initial du chantier, ContratNouveauPage est un
// formulaire simple sur une seule page : ni wizard multi-étapes, ni dépendance
// aux tarifs ou structures, ni génération de PDF (écriture directe via
// useContrats().creerContrat) — vérifié en lisant le code avant d'écrire ce test.
//
// ── Données ──────────────────────────────────────────────────────────────
// Julien Bernard, déjà le bénéficiaire des tests de contrat côté desktop
// (10-creation-contrat.spec.ts). Aucun bénéficiaire n'est créé.
//
// Nettoyage : suppression directe en base (clientAdminTest), jamais par l'UI.
// On cible le contrat par une NOTE unique à ce run plutôt que « le plus
// récent du participant » : Julien est partagé, et un run parallèle pourrait
// créer un contrat entre la création et le nettoyage — « le plus récent »
// supprimerait alors celui d'un autre test.

test.describe('Création d\'un contrat sur mobile (route fusionnée /contrat/nouveau)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer un contrat depuis la fiche mobile à 390px', async ({ page }) => {
    const nomComplet = `${env.patientPrenom2} ${env.patientNom2}`;
    const marqueur = `E2E mobile contrat ${Date.now()}`;

    // ── Récupération de l'URL de la fiche, côté desktop ───────────────────
    // /` n'affiche pas la liste des bénéficiaires sous 768 px (accueil mobile) :
    // on passe par le viewport desktop pour atteindre la fiche, puis on bascule
    // — même procédé que 19-bilan-detail et 25-comparaison.
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginPraticien(page);
    await page.goto('/');
    await page.getByRole('heading', { name: nomComplet }).click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
    const participantUrl = page.url();
    const participantId = participantUrl.match(/\/participant\/([0-9a-fA-F-]+)$/)?.[1] ?? null;
    expect(participantId, 'id du participant introuvable dans l\'URL').not.toBeNull();
    await page.waitForLoadState('networkidle');

    try {
      // ── Parcours mobile réel : fiche → bouton « Contrat » ───────────────
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Contrat', exact: true }).click();
      // Route fusionnée : on atteint le formulaire, pas l'écran
      // « Bientôt en version mobile » (ce que faisait ecranMobileDepuisUrl
      // avant ce chantier — voir routesMobile.test.ts).
      await page.waitForURL(/\/participant\/[0-9a-fA-F-]+\/contrat\/nouveau$/);
      await expect(page.getByRole('heading', { name: 'Nouveau contrat de suivi' })).toBeVisible();
      await expect(page.getByText('Bientôt en version mobile')).toHaveCount(0);

      // ── Jours de séance : obligatoires, en nombre égal à la fréquence ───
      // Fréquence par défaut = 2 séances/semaine, aucun jour présélectionné.
      // Sans cette étape, validerNouveauContrat refuse la création.
      const jours = page.getByText('Jours de séance *').locator('..');
      await jours.getByRole('button', { name: 'Lun', exact: true }).click();
      await jours.getByRole('button', { name: 'Jeu', exact: true }).click();

      // Note unique : sert de marqueur pour la vérification ET le nettoyage.
      await page.getByPlaceholder(/séances prescrites par le Dr/).fill(marqueur);

      await page.getByRole('button', { name: 'Créer le contrat et générer les séances' }).click();

      // Le contrat ne génère plus les séances automatiquement : la génération
      // est passée sur Tournée → Planifier, et le toast le dit.
      await expect(page.getByText(/Contrat créé\. Allez sur Tournée/)).toBeVisible();

      // ── Présence après création ────────────────────────────────────────
      // La page redirige vers la fiche : le contrat doit y être visible dans
      // l'onglet Contrats, reconnaissable à sa note.
      await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
      await page.getByRole('button', { name: /Contrats de suivi/ }).click();
      await expect(page.getByText(marqueur)).toBeVisible({ timeout: 15000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'ContratNouveauPage ne doit pas déborder horizontalement à 390px').toBe(false);
    } finally {
      // ── Nettoyage : uniquement LE contrat créé par ce run ───────────────
      const admin = clientAdminTest();
      if (admin && participantId) {
        await admin.from('contrats').delete().eq('participant_id', participantId).eq('notes', marqueur);
      }
    }
  });
});
