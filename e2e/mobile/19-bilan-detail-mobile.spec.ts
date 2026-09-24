import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';

// Chantier « fusion du détail de bilan » : /participant/:id/bilan/:bilanId
// est désormais une route fusionnée (estRouteInterfaceUnique,
// src/lib/routesMobile.ts), servie par BilanDetail directement — plus par
// DetailBilanMobile (retiré d'AppMobile.tsx). Radar + tableau comparatif
// remplacent l'ancienne liste plate à 13 valeurs, avec l'oubli SpO2 après
// corrigé au passage (nouvelle carte « Mesures TM6 »).
//
// La création du bilan de test passe par /agenda-v2-like flow desktop
// (/bilan/new reste mobile-only, pas fusionné dans ce chantier) — viewport
// desktop temporaire, comme les chantiers précédents (rotation réelle du
// téléphone). Mode Stepper choisi ici : c'est la branche « pas », la plus
// à risque de régression (résultat exprimé en pas, pas en mètres — voir
// resultatTm6, lib/tm6.ts). Les modes Marche et Marche sur place ont été
// vérifiés séparément par capture d'écran réelle pendant le développement
// (voir le rapport du chantier) plutôt que triplés ici, la création de
// bilan via l'UI étant coûteuse et peu robuste à automatiser trois fois.

test.describe('Détail de bilan sur mobile (route fusionnée /bilan/:id)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('radar, tableau comparatif et SpO2 après (mode Stepper) s\'affichent à 390px', async ({ page }) => {
    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    await loginPraticien(page);

    // ── Création du bilan de test, côté desktop ──────────────────────────
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await page.getByRole('heading', { name: nomComplet }).waitFor({ timeout: 20000 });
    await page.getByRole('heading', { name: nomComplet }).click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
    const participantUrl = page.url();
    // Laisse les requêtes initiales de la fiche se terminer avant de
    // renaviguer : sinon page.goto() les annule en plein vol
    // (net::ERR_ABORTED), remonté par supabase-js en "Failed to fetch".
    await page.waitForLoadState('networkidle');

    await page.goto(`${participantUrl}/bilan/new`);
    // Un brouillon d'une tentative précédente peut proposer un écran de
    // reprise à la place du stepper : on repart toujours de zéro.
    const recommencerBtn = page.getByRole('button', { name: /Recommencer/ });
    const dateInput = page.locator('input[type="date"]');
    await Promise.race([
      recommencerBtn.waitFor({ state: 'visible', timeout: 30000 }),
      dateInput.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    if (await recommencerBtn.isVisible().catch(() => false)) {
      await recommencerBtn.click();
      await dateInput.waitFor({ timeout: 20000 });
    }

    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.locator('#tm6-type-test').waitFor({ timeout: 10000 });
    await page.locator('#tm6-type-test').selectOption('stepper');
    await page.locator('#tm6-pas').fill('650');
    await page.getByLabel('FC — Avant le test').fill('72');
    await page.getByLabel('SpO2 — Avant le test').fill('97');
    await page.getByLabel('FC — Minute 6').fill('112');
    await page.getByLabel('SpO2 — Minute 6').fill('94');
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: 'Enregistrer le bilan' }).click();
    await page.getByText('Bilan enregistré !').waitFor({ timeout: 15000 });
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+\/bilan\/[0-9a-fA-F-]+$/);
    const bilanUrl = page.url();

    try {
      // ── Vérification mobile (390×844), même URL ──────────────────────
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(bilanUrl);
      // Route fusionnée : reste sur /bilan/:id, pas de repli sur l'accueil
      // mobile (ce que faisait ecranMobileDepuisUrl avant ce chantier).
      await expect(page).toHaveURL(bilanUrl);

      await expect(page.getByText('Profil radar')).toBeVisible();
      await expect(page.getByText('Résultats comparatifs')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();

      // Mode Stepper : bon libellé et bonne unité (pas "0 m").
      await expect(page.getByText('TM6 — Stepper')).toBeVisible();
      await expect(page.getByText('650 pas')).toBeVisible();

      // SpO2 après — l'oubli corrigé dans ce chantier (point 6).
      await expect(page.getByText('Mesures TM6')).toBeVisible();
      await expect(page.getByText(/94\s*%/)).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'BilanDetail ne doit pas déborder horizontalement à 390px').toBe(false);
    } finally {
      // ── Nettoyage : supprime le bilan de test ─────────────────────────
      // `isVisible()` seul, appelé trop tôt après une navigation, a déjà
      // fait manquer ce nettoyage (carte pas encore montée, jugée absente à
      // tort — même piège que dans le chantier tournée). On attend
      // explicitement le réseau ET la carte avant de conclure.
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: /Historique bilans/ }).waitFor({ timeout: 20000 });
      await page.getByRole('button', { name: /Historique bilans/ }).click();
      const carte = page.locator('div').filter({ hasText: '650 pas' }).filter({ hasText: 'Voir' }).last();
      const present = await carte.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      if (present) {
        await carte.getByTitle('Supprimer ce bilan').click();
        await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
        await page.getByRole('button', { name: 'Supprimer définitivement' }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      }
    }
  });
});
