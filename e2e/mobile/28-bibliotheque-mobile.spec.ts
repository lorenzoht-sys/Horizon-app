import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Chantier « Bibliothèque (exercices, modèles) — mobile » : /bibliotheque
// rejoint estRouteInterfaceUnique (src/lib/routesMobile.ts). La route
// tombait jusqu'ici sur l'écran « pas encore de version téléphone », alors
// que BibliothequePage.tsx n'est qu'un shell à 2 onglets (37 lignes) — la
// grille d'ExercicesPage.tsx est déjà responsive (1 colonne dès le mobile)
// et ModelesProgrammePage.tsx réutilise le wizard déjà mobile (#87-89).
//
// Seul vrai défaut trouvé par lecture + mesure (pas supposé) : les 3
// modales de ExercicesPage.tsx et ExerciceCard.tsx étaient en z-50, sous
// BarreNavigationMobile (z-index 100, App.tsx) — leurs boutons d'action du
// bas devenaient partiellement inatteignables sous 768px. Corrigé en
// z-[1100], même valeur que ProgrammeWizardModal (déjà mobile).
//
// Le glisser-déposer HTML5 (rail de dossiers) ne fonctionne pas au
// toucher — sans régression : la modale à cases à cocher (DossierModal)
// est l'accès pour ajouter un exercice à un dossier, indépendante du drag.
// Seule perte réelle et acceptée : réordonner les dossiers entre eux
// (action rare, aucune alternative tactile ajoutée dans ce chantier).

test.describe('Bibliothèque (exercices, modèles) sur mobile (route fusionnée /bibliotheque)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut filtrer les exercices, ranger dans un dossier et créer un modèle, à 390px', async ({ page }) => {
    test.setTimeout(60000);
    const nomDossier = `E2E dossier bibliothèque ${Date.now()}`;
    const nomModele = `E2E modèle bibliothèque ${Date.now()}`;

    await page.setViewportSize({ width: 390, height: 844 });
    await loginPraticien(page);

    // ── Entrée réelle : Plus → Bibliothèque exercices ───────────────────
    await page.goto('/?onglet=plus');
    await page.getByRole('button', { name: 'Bibliothèque exercices' }).click();
    await page.waitForURL(/\/bibliotheque$/);
    // Route fusionnée : la barre de navigation reste montée (pas l'écran
    // « Bientôt en version mobile » que servait PREFIXES_DESKTOP_SEULEMENT
    // avant ce chantier).
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expect(page.getByText('Bientôt en version mobile')).toHaveCount(0);

    const nomExercice = `E2E exercice bibliothèque ${Date.now()}`;
    let dossierId: string | null = null;
    let modeleId: string | null = null;
    try {
      // ── Onglet Exercices (par défaut) — filtre par pastille catégorie ──
      await page.getByRole('button', { name: '🟢 Force' }).click();
      await expect(page.getByText(/glissez une carte sur un dossier/)).toBeVisible();

      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'onglet Exercices : pas de défilement horizontal à 390px').toBe(false);

      // ── Créer un dossier, l'ouvrir (modale à cases à cocher), y ranger
      // un exercice — sans passer par le glisser-déposer (non tactile). ──
      await page.getByRole('button', { name: /Créer un dossier/ }).click();
      await page.getByPlaceholder('Nom du dossier').fill(nomDossier);
      await page.getByRole('button', { name: 'Créer', exact: true }).click();
      await expect(page.getByText('Dossier créé')).toBeVisible({ timeout: 10000 });
      // Attend la disparition du toast avant de continuer : sinon il traîne
      // en bas d'écran pendant les vérifications suivantes (recouvrement,
      // hit-test) et fausse le diagnostic — pas une vraie barre de
      // navigation, mais un faux positif au même endroit.
      await page.getByText('Dossier créé').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});

      await page.getByText(nomDossier).click();
      await expect(page.getByText('Cochez les exercices à ranger dans ce dossier')).toBeVisible();

      // Le bouton "Terminé" du bas de la modale doit être réellement
      // cliquable — pas seulement visible — malgré la barre de navigation
      // fixe : preuve directe du correctif de z-index (sans lui, la barre
      // du bas interceptait ce clic, voir rapport du chantier).
      const premiereCheckbox = page.locator('input[type="checkbox"]').first();
      await premiereCheckbox.click();
      await expect(premiereCheckbox).toBeChecked();
      await page.getByRole('button', { name: 'Terminé' }).click();
      await expect(page.getByText('Cochez les exercices à ranger dans ce dossier')).toHaveCount(0);

      // ── Modale « Nouvel exercice » — c'est ELLE (max-h-[90vh], plus
      // haute que la modale dossier) qui portait le recouvrement le plus
      // net avant correctif : ses boutons « Annuler »/« Ajouter » du bas
      // étaient réellement inatteignables (confirmé par elementFromPoint —
      // voir rapport du chantier), pas seulement visuellement chevauchés.
      // C'est ce clic sur « Ajouter » qui prouve la régression si le
      // z-index revient à z-50 (testé dans les deux sens). ────────────────
      await page.getByRole('button', { name: /Ajouter un exercice/ }).click();
      const modaleExercice = page.locator('div').filter({ has: page.getByText('Nouvel exercice') });
      await modaleExercice.locator('input').first().fill(nomExercice);

      // Preuve directe et déterministe du correctif de z-index — plus
      // fiable que .click() seul (Playwright peut réussir un clic dont le
      // point exact tombe pile sur la frontière visuelle de la barre du
      // bas, sans détecter l'interception) : au centre EXACT du bouton
      // « Ajouter », l'élément le plus haut dans la pile doit appartenir à
      // la modale, jamais à BarreNavigationMobile.
      const ajouterBtn = page.getByRole('button', { name: 'Ajouter', exact: true });
      const boiteAjouter = await ajouterBtn.boundingBox();
      // Point vérifié à 5px du bas du bouton (pas son centre géométrique,
      // qui tombe pile sur la frontière avec la barre de nav et ne
      // distingue pas de façon fiable les deux cas) : sans le correctif,
      // c'est là que le recouvrement est sans ambiguïté (~20px de haut,
      // confirmé par capture d'écran — voir rapport du chantier).
      const auSommet = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const nav = document.querySelector('nav[aria-label="Navigation principale"]');
        return { estLaBarreDeNav: !!nav && (el === nav || nav.contains(el)) };
      }, { x: boiteAjouter!.x + boiteAjouter!.width / 2, y: boiteAjouter!.y + boiteAjouter!.height - 5 });
      expect(auSommet.estLaBarreDeNav, 'le bas du bouton "Ajouter" ne doit pas être recouvert par la barre de navigation').toBe(false);

      await ajouterBtn.click();
      await expect(page.getByText('Exercice ajouté à la bibliothèque')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(nomExercice)).toBeVisible();

      // ── Recouvrement bas de page — le correctif partagé
      // (PageTransition.tsx, chantier précédent) doit s'appliquer ici
      // automatiquement, sans rien de spécifique à cette page. ───────────
      const recouvrement = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Navigation principale"]');
        const scrollDiv = nav!.parentElement!.previousElementSibling as HTMLElement;
        scrollDiv.scrollTop = scrollDiv.scrollHeight;
        const navTop = nav!.getBoundingClientRect().top;
        let maxBottom = 0;
        for (const el of scrollDiv.querySelectorAll('*')) {
          if (el.children.length > 0) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.bottom > maxBottom) maxBottom = r.bottom;
        }
        return Math.max(0, maxBottom - navTop);
      });
      expect(recouvrement, 'onglet Exercices ne doit pas passer sous la barre du bas').toBeLessThanOrEqual(1);

      // ── Onglet Modèles de programme — créer un modèle minimal ──────────
      await page.getByRole('button', { name: 'Modèles de programme' }).click();
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'onglet Modèles : pas de défilement horizontal à 390px').toBe(false);

      await page.getByRole('button', { name: /Créer un modèle/ }).first().click();
      await expect(page.getByText('Étape 1/4')).toBeVisible();
      await page.getByPlaceholder('ex: Rééducation post-chute').fill(nomModele);
      await page.getByRole('button', { name: /Suivant/ }).click(); // 1 → 2
      await expect(page.getByText('Étape 2/4')).toBeVisible();
      await page.getByRole('button', { name: /Suivant/ }).click(); // 2 → 3 (aucun bloc : autorisé)
      await expect(page.getByText('Étape 3/4')).toBeVisible();
      await page.getByRole('button', { name: /Suivant/ }).click(); // 3 → 4
      await expect(page.getByText('Étape 4/4')).toBeVisible();
      await page.getByRole('button', { name: '✅ Enregistrer le modèle' }).click();
      await expect(page.getByText('Modèle créé !')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(nomModele)).toBeVisible();
    } finally {
      // ── Nettoyage — aucune suppression de dossier depuis l'UI
      // (fonctionnalité absente) : ciblage précis par nom, scopé au
      // praticien de test. ────────────────────────────────────────────
      const admin = clientAdminTest();
      if (admin) {
        const { data: praticien } = await admin.from('praticiens')
          .select('id').eq('email', process.env.E2E_PRATICIEN_EMAIL).maybeSingle();
        const praticienId = praticien?.id;

        if (praticienId) {
          const { data: dossier } = await admin.from('dossiers_exercices')
            .select('id').eq('praticien_id', praticienId).eq('nom', nomDossier).maybeSingle();
          dossierId = dossier?.id ?? null;
          if (dossierId) {
            try { await admin.from('dossier_exercice_membres').delete().eq('dossier_id', dossierId); } catch { /* non bloquant */ }
            await admin.from('dossiers_exercices').delete().eq('id', dossierId);
          }

          const { data: modele } = await admin.from('programmes_modeles')
            .select('id').eq('praticien_id', praticienId).eq('nom', nomModele).maybeSingle();
          modeleId = modele?.id ?? null;
          if (modeleId) {
            await admin.from('programmes_modeles').delete().eq('id', modeleId);
          }

          await admin.from('exercices_personnalises')
            .delete().eq('praticien_id', praticienId).eq('nom', nomExercice);
        }
      }
    }
  });
});
