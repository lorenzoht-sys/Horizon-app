import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from '../helpers.js';

// Chantier « Programme — consultation complète depuis la fiche mobile » :
// ParticipantProfile.tsx (route fusionnée /participant/:id) limitait
// l'aperçu du programme à 4 exercices, et surtout — trouvaille du
// chantier, pas supposée par le diagnostic initial — n'affichait NI
// compte NI liste d'exercices pour tout programme créé aujourd'hui : la
// création passe exclusivement par useProgrammeV2 (ProgrammePage.tsx),
// qui laisse vide la colonne JSON `exercices` que lisait ce composant
// (héritée de useProgramme, V1). Un "Voir tout" remplace la limite fixe,
// sourcé depuis useProgrammeV2 quand un programme V2 est actif — voir
// ParticipantProfile.tsx pour le détail.
//
// Julien Bernard (env.patientPrenom2/patientNom2) est choisi comme
// bénéficiaire de test : sans bilan ni programme au départ (voir
// 17-cours-collectifs-mobile.spec.ts), donc rien d'existant à perturber.
// Création du programme via le vrai assistant (ProgrammePage.tsx,
// desktop — /programme n'a pas de version mobile, hors périmètre de ce
// chantier) : 5 exercices ajoutés depuis la bibliothèque (aucun nom fixe
// supposé exister — capturés dynamiquement puis vérifiés affichés sur
// mobile), pour dépasser la limite d'aperçu et déclencher "Voir tout".

test.describe('Programme — "Voir tout" depuis la fiche mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un programme de 5 exercices se déplie entièrement avec ses détails', async ({ page }) => {
    // Au-delà du défaut (30s) : assistant de création (4 étapes, 5 ajouts
    // d'exercice), aller-retour desktop → mobile, dépliage, puis nettoyage
    // — un flux plus long que les autres tests mobile de ce projet.
    test.setTimeout(45000);
    const nomComplet = `${env.patientPrenom2} ${env.patientNom2}`;
    const titreProgramme = `Programme E2E voir-tout ${Date.now()}`;

    await loginPraticien(page);

    // ── Création du programme, côté desktop (/programme) ─────────────────
    await page.setViewportSize({ width: 1400, height: 900 });
    await ouvrirFicheParticipant(page, nomComplet);
    const participantUrl = page.url();

    await page.goto(`${participantUrl}/programme`);
    await page.getByRole('button', { name: 'Créer un programme' }).first().click();

    // Étape 1/4 — infos générales.
    await page.getByPlaceholder('ex: Programme Équilibre').fill(titreProgramme);
    await page.getByRole('button', { name: /Suivant/ }).click();

    // Étape 2/4 — un bloc de séance, 5 exercices depuis la bibliothèque.
    await page.getByRole('button', { name: 'Ajouter un bloc de séance' }).click();
    await page.getByRole('button', { name: 'Ajouter un exercice' }).click();

    // `.first()` recyclé à chaque itération : une fois un exercice ajouté,
    // son bouton passe à "✓ Ajouté" et sort du lot, le suivant devient donc
    // "le premier" — 5 clics suffisent pour 5 exercices distincts, sans
    // connaître leurs noms à l'avance (catalogue partagé, pas fixe ici).
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: '+ Ajouter' }).first().click();
    }
    await page.getByRole('button', { name: /Fermer/ }).click();

    // Noms réellement ajoutés : lus depuis les champs du formulaire de
    // chaque exercice (Step2, ExerciceForm — <input placeholder="Nom de
    // l'exercice *">), plus robuste qu'un scraping du DOM de la liste de
    // la bibliothèque (pas de sélecteur stable là-bas).
    const inputsNoms = page.locator('input[placeholder="Nom de l\'exercice *"]');
    await expect(inputsNoms).toHaveCount(5);
    const nomsExercices: string[] = [];
    for (const el of await inputsNoms.all()) {
      const v = await el.inputValue();
      if (v) nomsExercices.push(v);
    }
    expect(nomsExercices.length, 'Au moins 5 exercices doivent être disponibles dans la bibliothèque').toBe(5);

    await page.getByRole('button', { name: /Suivant/ }).click(); // 2 → 3
    await page.getByRole('button', { name: /Suivant/ }).click(); // 3 → 4
    await page.getByRole('button', { name: '✅ Sauvegarder et partager' }).click();
    await expect(page.getByText('Programme créé et partagé avec le bénéficiaire !')).toBeVisible();

    try {
      // ── Vérification mobile (390×844), fiche fusionnée ────────────────
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(titreProgramme)).toBeVisible();
      await expect(page.getByText('· 5 exercices')).toBeVisible();

      // Aperçu par défaut : pas plus de 4 lignes, bouton "Voir tout" présent.
      const boutonVoirTout = page.getByRole('button', { name: /Voir tout \(5\)/ });
      await expect(boutonVoirTout).toBeVisible();

      await boutonVoirTout.click();
      await expect(page.getByRole('button', { name: 'Réduire' })).toBeVisible();
      for (const nom of nomsExercices) {
        await expect(page.getByText(nom, { exact: true }).first()).toBeVisible();
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'la liste dépliée ne doit pas provoquer de défilement horizontal à 390px').toBe(false);

      await page.screenshot({ path: 'programme-voir-tout-390.png', fullPage: false });
    } finally {
      // ── Nettoyage : supprime le programme de test ──────────────────────
      await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
      await page.goto(participantUrl).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      const titreVisible = await page.getByText(titreProgramme).isVisible().catch(() => false);
      if (titreVisible) {
        // `exact: true` : sans lui, ce sélecteur matchait aussi "Supprimer
        // ce bilan" (fiche de Julien, section Historique bilans — texte
        // "Supprimer" en sous-chaîne), une correspondance en trop qui
        // décalait `nth(1)` vers le mauvais bouton et bloquait le clic
        // suivant jusqu'au timeout par défaut de Playwright. Deux boutons
        // "Supprimer" (exact) existent une fois la modale ouverte : celui
        // de la carte (déjà présent) et celui de la confirmation.
        const boutonsSupprimer = page.getByRole('button', { name: 'Supprimer', exact: true });
        await boutonsSupprimer.first().click().catch(() => {});
        await expect(boutonsSupprimer).toHaveCount(2, { timeout: 10000 }).catch(() => {});
        await boutonsSupprimer.nth(1).click().catch(() => {});
        await page.getByText('Supprimer le programme ?').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      }
    }
  });
});
