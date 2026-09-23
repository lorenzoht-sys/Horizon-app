import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';

// Chantier « cours collectifs visibles sur mobile » : useCoursCollectifs.ts
// et ModalPresenceCoursCollectif.tsx sont du code partagé, mais AppMobile.tsx
// n'en importait rien — un jour avec un cours collectif apparaissait vide
// dans EcranAujourdhui et EcranTournee, et « Désarchiver »-like, la présence
// n'était marquable que depuis le desktop.
//
// La création d'un cours collectif n'a PAS de version mobile (hors périmètre
// de ce chantier, /agenda-v2 reste desktop-only — voir
// PREFIXES_DESKTOP_SEULEMENT, routesMobile.ts) : ce test bascule donc
// temporairement en viewport desktop pour créer le cours de test, exactement
// comme le fait déjà 13-rotation-portrait-paysage.spec.ts pour la rotation
// réelle du téléphone. Le reste du test (lecture, présence, nettoyage) reste
// en 390×844, le viewport du projet "Mobile".

test.describe('Cours collectifs sur mobile (lecture + présence)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un cours créé côté desktop apparaît en lecture sur mobile, et sa présence s\'y marque et persiste', async ({ page }) => {
    const titreCours = `RLS-E2E cours mobile ${Date.now()}`;
    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    const note = `Note E2E ${Date.now()}`;

    await loginPraticien(page);

    // ── Création du cours de test, côté desktop (/agenda-v2) ────────────
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/agenda-v2');
    await page.getByRole('button', { name: /Nouveau cours collectif/ }).click();
    // Le nom du bénéficiaire apparaît aussi ailleurs sur AgendaV2Page,
    // toujours dans le DOM derrière la modale (ni ModalNouveauCoursCollectif
    // ni ModalPresenceCoursCollectif n'ont de role="dialog") : on scope sur
    // la carte de la modale elle-même, via ses classes (uniques pendant
    // qu'une seule modale est ouverte à la fois).
    const modaleCreation = page.locator('.rounded-2xl.shadow-xl.max-w-lg');
    await modaleCreation.getByPlaceholder('Gym douce, Équilibre en groupe…').fill(titreCours);
    // Heure (10:00) et durée (45 min) par défaut : pas besoin d'y toucher.
    await modaleCreation.getByPlaceholder('Rechercher…').fill(env.patientPrenom);
    await modaleCreation.getByText(nomComplet, { exact: true }).click();
    await modaleCreation.getByRole('button', { name: 'Créer le cours' }).click();
    await expect(page.getByText('Cours collectif créé')).toBeVisible({ timeout: 10000 });

    // ── Lecture sur mobile : EcranAujourdhui ─────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByText(titreCours)).toBeVisible();
    await expect(page.getByText('1 inscrit')).toBeVisible();

    // ── Lecture sur mobile : EcranTournee, distinguée d'une séance ───────
    await page.goto('/tournee');
    await expect(page.getByText(titreCours)).toBeVisible();
    await expect(page.getByText('1 inscrit', { exact: false })).toBeVisible();

    // La carte du cours (titre + bouton), pas une séance individuelle —
    // plusieurs cartes peuvent partager le libellé du bouton, on scope donc
    // sur celle qui contient aussi le titre unique de ce cours.
    const carteCours = page.locator('div')
      .filter({ hasText: titreCours })
      .filter({ hasText: 'Gérer les présences' })
      .last();
    await carteCours.getByRole('button', { name: /Gérer les présences/ }).click();

    // ── Modale de présence, utilisable à 390px ───────────────────────────
    await expect(page.getByRole('heading', { name: titreCours })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, 'la modale de présence ne doit pas provoquer de défilement horizontal à 390px').toBe(false);

    // ── Marquer une présence, avec une note ──────────────────────────────
    await page.getByRole('button', { name: 'Absent' }).click();
    await page.getByLabel(`Note sur ${env.patientPrenom}`).fill(note);
    await page.getByRole('button', { name: /Enregistrer/ }).click();
    await expect(page.getByText(`${env.patientPrenom} : mis à jour`)).toBeVisible({ timeout: 10000 });

    // ── Persistance : rechargement complet, la note doit survivre ────────
    await page.reload();
    await expect(page.getByText(titreCours)).toBeVisible();
    const carteCoursApresRechargement = page.locator('div')
      .filter({ hasText: titreCours })
      .filter({ hasText: 'Gérer les présences' })
      .last();
    await carteCoursApresRechargement.getByRole('button', { name: /Gérer les présences/ }).click();
    await expect(page.getByLabel(`Note sur ${env.patientPrenom}`)).toHaveValue(note);

    // ── Nettoyage : annuler le cours depuis la modale (mobile) ───────────
    // modifierStatutCours n'affiche pas de toast de succès (seulement en cas
    // d'erreur) : on attend la disparition du bouton lui-même — elle ne
    // survient qu'une fois l'écriture Supabase confirmée et l'état local mis
    // à jour (voir useCoursCollectifs.ts) — avant de recharger, sinon le
    // rechargement peut interrompre l'écriture encore en vol.
    await page.getByRole('button', { name: 'Annuler le cours' }).click();
    await expect(page.getByRole('button', { name: 'Annuler le cours' })).toBeHidden({ timeout: 10000 });
    await page.reload();
    await expect(page.getByText(titreCours)).toHaveCount(0);
  });
});
