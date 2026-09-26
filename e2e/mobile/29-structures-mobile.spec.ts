import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Chantier « Structures (liste + détail) — mobile » : aucune liste de
// structures n'existait comme route avant ce chantier — seulement un onglet
// de Dashboard.tsx (route "/", jamais fusionnée : l'accueil mobile est
// EcranAccueil, un tout autre composant). Nouvelle page StructuresPage.tsx
// (route /structures, fusionnée dès l'écriture, sur le modèle
// d'ArchivesPage.tsx), + StructureDetail.tsx (route existante) rejoint
// estRouteInterfaceUnique.
//
// Frontière structures/facturation : la carte « 💶 Facturation » de
// StructureDetail.tsx (génération/suivi de factures — Phase 4) est masquée
// sous 768px (hidden md:block), pas supprimée — le reste (bénéficiaires
// rattachés, informations, accès portail, zone de danger, génération de
// compte rendu par bénéficiaire) est fusionné.
//
// Même anti-motif que le chantier Bibliothèque : GenererCompteRenduModal.tsx
// et la modale de confirmation d'envoi de facture de StructureDetail.tsx
// étaient en z-50, sous BarreNavigationMobile (z-index 100, App.tsx).
// Corrigées en z-[1100] par cohérence — mais contrairement à Bibliothèque,
// non reproduites ici par un test qui échouerait sans le correctif : la
// modale de compte rendu reste courte à l'étape atteignable sans upload de
// fichier réel, et celle de confirmation d'envoi n'est jamais atteignable
// sur mobile (bouton dans la carte Facturation, masquée). Voir le
// commentaire au point d'assertion plus bas.

test.describe('Structures (liste + détail) sur mobile (routes fusionnées /structures, /structures/:id)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut créer une structure, consulter son détail sans facturation, et générer un compte rendu, à 390px', async ({ page }) => {
    test.setTimeout(60000);
    const nomStructure = `E2E Structure mobile ${Date.now()}`;
    const nomBeneficiaire = `${env.patientPrenom2} ${env.patientNom2}`;

    await page.setViewportSize({ width: 390, height: 844 });
    await loginPraticien(page);

    // ── Entrée réelle : Plus → Structures ───────────────────────────────
    await page.goto('/?onglet=plus');
    await page.getByRole('button', { name: 'Structures', exact: true }).click();
    await page.waitForURL(/\/structures$/);
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expect(page.getByText('Bientôt en version mobile')).toHaveCount(0);
    // useStructures() résout praticienId de façon async après le montage
    // (auth.getUser()) : sans cette attente, la création peut tomber avant
    // que cet id soit prêt et échouer avec « vérifiez que la table
    // Supabase "structures" existe » — pas un vrai problème de table.
    await page.waitForLoadState('networkidle');

    let overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, 'liste des structures : pas de défilement horizontal à 390px').toBe(false);

    let structureId: string | null = null;
    const admin = clientAdminTest();
    try {
      // ── Créer une structure depuis la liste mobile ────────────────────
      await page.getByRole('button', { name: /Créer une structure/ }).click();
      await page.getByPlaceholder('EHPAD Les Rosiers').fill(nomStructure);
      await page.getByPlaceholder('m.durand@ehpad.fr').fill('contact.e2e.mobile@example.com');
      await page.getByRole('button', { name: 'Créer la structure' }).click();
      await expect(page.getByText(`Structure "${nomStructure}" créée`)).toBeVisible({ timeout: 10000 });
      await page.waitForURL(/\/structures\/[0-9a-fA-F-]+$/);
      structureId = page.url().match(/\/structures\/([0-9a-fA-F-]+)$/)?.[1] ?? null;
      expect(structureId, 'id de structure introuvable dans l\'URL').not.toBeNull();

      // ── Frontière facturation : masquée sous 768px, reste visible ─────
      await expect(page.getByText('💶 Facturation')).toHaveCount(0);
      await expect(page.getByText('⚙️ Informations')).toBeVisible();
      await expect(page.getByText('Zone de danger')).toBeVisible();

      overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'détail de structure : pas de défilement horizontal à 390px').toBe(false);

      // ── Rattache Julien (bénéficiaire de test partagé, sans bilan) pour
      // tester la carte Bénéficiaires + la génération de compte rendu. ───
      if (admin && structureId) {
        const [prenom, ...reste] = nomBeneficiaire.split(' ');
        const { data: beneficiaire } = await admin.from('participants')
          .select('id').eq('prenom', prenom).eq('nom', reste.join(' ')).maybeSingle();
        if (beneficiaire) {
          await admin.from('participants').update({ structure_id: structureId }).eq('id', beneficiaire.id);
          await page.reload();
          await page.waitForLoadState('networkidle');

          await expect(page.getByText(/Bénéficiaires \(1\)/)).toBeVisible({ timeout: 10000 });
          await expect(page.getByText(nomBeneficiaire)).toBeVisible();

          // ── z-index : vérifie l'invariant (la modale doit rester
          // au-dessus de la barre de navigation), sans prétendre le
          // prouver par un test qui échouerait sans le correctif — à cette
          // étape (aucun template), la modale ne fait que ~374px de haut à
          // 390×844 et n'atteint jamais la zone de la barre du bas,
          // contrairement à la modale "Nouvel exercice" du chantier
          // Bibliothèque (formulaire long, recouvrement réel mesuré).
          // Correctif gardé par cohérence avec le même anti-motif corrigé
          // ailleurs, pas comme régression démontrée ici.
          await page.getByRole('button', { name: /Générer un compte rendu/ }).click();
          const boutonAnnuler = page.getByRole('button', { name: 'Annuler', exact: true });
          await expect(boutonAnnuler).toBeVisible();
          const boite = await boutonAnnuler.boundingBox();
          const recouvertParNav = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            const nav = document.querySelector('nav[aria-label="Navigation principale"]');
            return !!nav && (el === nav || nav.contains(el));
          }, { x: boite!.x + boite!.width / 2, y: boite!.y + boite!.height - 5 });
          expect(recouvertParNav, 'le bouton "Annuler" de la modale de compte rendu ne doit pas être recouvert par la barre de navigation').toBe(false);
          await boutonAnnuler.click();

          await admin.from('participants').update({ structure_id: null }).eq('id', beneficiaire.id);
        }
      }
    } finally {
      // ── Nettoyage via la fonctionnalité réelle de l'app ────────────────
      if (structureId) {
        await page.goto(`/structures/${structureId}`).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.getByRole('button', { name: /Supprimer cette structure/ }).click().catch(() => {});
        await page.getByRole('button', { name: 'Confirmer' }).click().catch(() => {});
        await page.getByText('Structure supprimée').waitFor({ timeout: 10000 }).catch(() => {});
      }
    }
  });
});
