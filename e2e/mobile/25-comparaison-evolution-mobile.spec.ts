import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from '../helpers.js';

// Chantier « comparaison / évolution » : /participant/:id/comparaison
// rejoint estRouteInterfaceUnique (src/lib/routesMobile.ts), atteignable
// depuis la fiche (menu « ··· » → « Rapport d'évolution », désactivé sous 2
// bilans — ParticipantProfile.tsx) et depuis le détail de bilan (bouton de
// même nom, BilanDetail.tsx), tous deux déjà fusionnés.
//
// Contrairement au chantier détail de bilan, ComparaisonPage NE réutilise
// PAS RadarChart/ComparisonTable (adaptés à 390px pour /bilan/:id, mais
// construits pour exactement 2 bilans) : elle prend TOUS les bilans du
// participant et affiche son propre TableauComparaison (N colonnes,
// overflow-x-auto déjà en place) et GraphiqueEvolution (LineChart recharts,
// 6 séries) — vérifié en lisant ComparaisonPage.tsx avant d'écrire ce test,
// le brief initial du chantier supposait à tort une réutilisation directe.
//
// ── Stratégie de données ─────────────────────────────────────────────────
// Réutilise les bilans déjà présents sur le participant de test s'il y en a
// déjà ≥ 2, pour éviter de dupliquer la création coûteuse par formulaire
// (déjà faite dans 19-bilan-detail-mobile.spec.ts). Ne crée que ce qui
// manque, avec un nombre de « pas » TM6 distinctif (111/222/333, jamais vu
// dans des données réelles) pour retrouver et supprimer UNIQUEMENT les
// bilans créés par ce test au nettoyage — jamais par date, qui pourrait
// coïncider avec un bilan réel déjà présent sur le compte de démo.

test.describe('Rapport d\'évolution sur mobile (route fusionnée /comparaison)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('tableau comparatif et courbes d\'évolution s\'affichent à 390px avec ≥ 2 bilans', async ({ page }) => {
    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    const pasCrees: string[] = [];

    // ── Repérage des bilans existants, côté desktop ───────────────────────
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginPraticien(page);
    await ouvrirFicheParticipant(page, nomComplet);
    const participantUrl = page.url();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Historique bilans/ }).click();
    const boutonsSupprimer = page.locator('[title="Supprimer ce bilan"]');
    const nbExistants = await boutonsSupprimer.count();

    const AUJOURDHUI = new Date();
    const J_MOINS_90 = new Date();
    J_MOINS_90.setDate(J_MOINS_90.getDate() - 90);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // Bilans à créer pour atteindre au moins 2 (aucun si déjà ≥ 2).
    const aCreer: { date: Date; pas: string }[] =
      nbExistants === 0 ? [{ date: J_MOINS_90, pas: '111' }, { date: AUJOURDHUI, pas: '222' }]
      : nbExistants === 1 ? [{ date: AUJOURDHUI, pas: '333' }]
      : [];

    async function creerBilan(date: Date, pas: string) {
      await page.goto(`${participantUrl}/bilan/new`);
      // Un brouillon d'une tentative précédente peut proposer un écran de
      // reprise à la place du stepper : on repart toujours de zéro (même
      // garde que 19-bilan-detail-mobile.spec.ts).
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
      await dateInput.fill(iso(date));

      await page.getByRole('button', { name: 'Suivant →' }).click();
      await page.getByRole('button', { name: 'Suivant →' }).click();
      await page.locator('#tm6-type-test').waitFor({ timeout: 10000 });
      await page.locator('#tm6-type-test').selectOption('stepper');
      await page.locator('#tm6-pas').fill(pas);
      await page.getByLabel('FC — Avant le test').fill('70');
      await page.getByLabel('SpO2 — Avant le test').fill('98');
      await page.getByLabel('FC — Minute 6').fill('105');
      await page.getByLabel('SpO2 — Minute 6').fill('96');
      await page.getByRole('button', { name: 'Suivant →' }).click();
      await page.getByRole('button', { name: 'Suivant →' }).click();
      await page.getByRole('button', { name: 'Enregistrer le bilan' }).click();
      await page.getByText('Bilan enregistré !').waitFor({ timeout: 15000 });
      await page.waitForURL(/\/participant\/[0-9a-fA-F-]+\/bilan\/[0-9a-fA-F-]+$/);
      pasCrees.push(pas);
    }

    try {
      for (const { date, pas } of aCreer) {
        await creerBilan(date, pas);
      }

      // ── Vérification mobile (390×844), même URL ─────────────────────────
      await page.setViewportSize({ width: 390, height: 844 });
      const comparaisonUrl = `${participantUrl}/comparaison`;
      await page.goto(comparaisonUrl);
      // Route fusionnée : reste sur /comparaison, pas de repli sur l'écran
      // « tournez votre téléphone » (ce que faisait ecranMobileDepuisUrl
      // avant ce chantier — voir routesMobile.test.ts).
      await expect(page).toHaveURL(comparaisonUrl);

      await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
      await expect(page.getByText('Tableau comparatif')).toBeVisible();
      await expect(page.getByText('Courbes d\'évolution')).toBeVisible();
      await expect(page.getByText('Résumé IA d\'évolution')).toBeVisible();

      // Au moins 2 bilans effectivement comparés : la colonne « Test » +
      // une colonne par bilan.
      const nbColonnes = await page.locator('#rapport-tableau table thead th').count();
      expect(nbColonnes).toBeGreaterThanOrEqual(3);

      // Le graphique recharts (ResponsiveContainer) s'est bien monté.
      await expect(page.locator('#rapport-graphique svg').first()).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'ComparaisonPage ne doit pas déborder horizontalement à 390px').toBe(false);
    } finally {
      // ── Nettoyage : supprime uniquement les bilans créés par ce test ───
      if (pasCrees.length > 0) {
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.goto(participantUrl);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: /Historique bilans/ }).waitFor({ timeout: 20000 });
        await page.getByRole('button', { name: /Historique bilans/ }).click();
        for (const pas of pasCrees) {
          const carte = page.locator('div').filter({ hasText: `${pas} pas` }).filter({ hasText: 'Voir' }).last();
          const present = await carte.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
          if (present) {
            await carte.getByTitle('Supprimer ce bilan').click();
            await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
            await page.getByRole('button', { name: 'Supprimer définitivement' }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
          }
        }
      }
    }
  });
});
