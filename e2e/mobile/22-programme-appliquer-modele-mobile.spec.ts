import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from '../helpers.js';

// Chantier « Programme — appliquer un modèle existant (mobile) » : premier
// des trois sous-chantiers de création de programme (le plus simple —
// appliquerModele() est un seul appel RPC, sans état de wizard). Le point
// d'entrée mobile (bouton "Utiliser un modèle", ParticipantProfile.tsx)
// existait déjà — la fiche est la route fusionnée /participant/:id — mais
// `onApplied` naviguait vers /participant/:id/programme (desktop-only, hors
// route fusionnée) : sur mobile, ça retombait sur l'invitation "tournez
// votre téléphone", jamais sur le programme appliqué. Corrigé pour
// recharger en place (programmeActif ET programmesV2 — voir
// ParticipantProfile.tsx et le nouveau `reload` de useProgramme.ts).
//
// Bénéficiaire de test dédié, créé et supprimé par ce test : Julien Bernard
// (le candidat "sans programme actif" habituel des chantiers précédents)
// ne l'est plus — 157 programmes de test orphelins (05-creation-programme.
// spec.ts, jamais nettoyé) s'y sont accumulés, aucun n'étant lié à ce
// chantier. Signalé séparément, pas nettoyé ici (données partagées, hors
// périmètre).
//
// 5 exercices dans le modèle de test (comme dans
// 21-programme-voir-tout-mobile.spec.ts) pour déclencher réellement le
// bouton "Voir tout" livré dans ce chantier précédent, pas juste vérifier
// sa présence sur un cas trivial à 1 exercice.

test.describe('Programme — appliquer un modèle depuis la fiche mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('appliquer un modèle affiche le programme en place, sans navigation', async ({ page }) => {
    test.setTimeout(60000);
    const nomModele = `Modèle E2E ${Date.now()}`;
    const prenomP = 'E2E';
    const nomP = `Modele${Date.now()}`;

    await loginPraticien(page);

    // ── Modèle de test, côté desktop (/bibliotheque) ─────────────────────
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/bibliotheque');
    await page.getByRole('button', { name: 'Modèles de programme' }).click();
    await page.getByRole('button', { name: 'Créer un modèle' }).first().click();
    await page.getByPlaceholder('ex: Rééducation post-chute').fill(nomModele);
    await page.getByRole('button', { name: /Suivant/ }).click(); // 1 → 2
    await page.getByRole('button', { name: 'Ajouter un bloc de séance' }).click();
    await page.getByRole('button', { name: 'Ajouter un exercice' }).click();
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: '+ Ajouter' }).first().click();
    }
    await page.getByRole('button', { name: /Fermer/ }).click();
    const inputsNoms = page.locator('input[placeholder="Nom de l\'exercice *"]');
    await expect(inputsNoms).toHaveCount(5);
    const nomsExercices: string[] = [];
    for (const el of await inputsNoms.all()) {
      const v = await el.inputValue();
      if (v) nomsExercices.push(v);
    }
    await page.getByRole('button', { name: /Suivant/ }).click(); // 2 → 3
    await page.getByRole('button', { name: /Suivant/ }).click(); // 3 → 4
    await page.getByRole('button', { name: '✅ Enregistrer le modèle' }).click();
    await expect(page.getByText('Modèle créé')).toBeVisible({ timeout: 10000 }).catch(() => {});

    // ── Bénéficiaire de test dédié, côté desktop (stepper 5 étapes) ──────
    await page.goto('/participants/nouveau');
    await page.getByPlaceholder('Jean', { exact: true }).fill(prenomP);
    await page.getByPlaceholder('Dupont', { exact: true }).fill(nomP);
    await page.getByPlaceholder('JJ/MM/AAAA', { exact: true }).fill('15/03/1955');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Suivant →' }).click();
    }
    await page.getByRole('button', { name: '1 séance/semaine', exact: true }).click();
    await page.getByRole('button', { name: 'Suivant →' }).click();
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.getByLabel('Le bénéficiaire a été informé et a consenti').check();
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/, { timeout: 15000 });
    const participantUrl = page.url();

    try {
      // ── Application depuis la fiche mobile (390×844) ───────────────────
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Utiliser un modèle' }).click();
      await page.getByText(nomModele, { exact: true }).waitFor({ timeout: 10000 });

      const urlAvant = page.url();
      // AppliquerModeleModal.tsx : <div row><div wrapper><div nom>{nom}</div>
      // ...</div><button>Utiliser</button></div> — remonter précisément de
      // 2 niveaux depuis le texte pour atteindre la ligne complète (nom +
      // bouton, siblings), pas juste le <div> du nom lui-même.
      const carteModele = page.getByText(nomModele, { exact: true }).locator('xpath=ancestor::div[2]');
      await carteModele.getByRole('button', { name: 'Utiliser' }).click();
      await expect(page.getByText('Modèle appliqué au bénéficiaire !')).toBeVisible({ timeout: 10000 });

      // Pas de navigation : la modale se ferme, la fiche reste la même URL.
      await expect(page.getByText(nomModele, { exact: true }).first()).toBeVisible({ timeout: 10000 });
      expect(page.url(), 'aucune navigation attendue après application').toBe(urlAvant);

      // "Voir tout" (chantier précédent) : les 5 exercices apparaissent.
      const boutonVoirTout = page.getByRole('button', { name: /Voir tout \(5\)/ });
      await expect(boutonVoirTout).toBeVisible();
      await boutonVoirTout.click();
      await expect(page.getByRole('button', { name: 'Réduire' })).toBeVisible();
      for (const nom of nomsExercices) {
        await expect(page.getByText(nom, { exact: true }).first()).toBeVisible();
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'ne doit pas provoquer de défilement horizontal à 390px').toBe(false);

      await page.screenshot({ path: 'programme-modele-applique-390.png', fullPage: false });
    } finally {
      // ── Nettoyage : supprime le bénéficiaire de test (cascade programme) ─
      // Attend la navigation vers "/" AVANT de continuer : signal fiable
      // que deleteParticipant() a réellement abouti côté Supabase, pas
      // seulement que le clic a eu lieu (même piège que dans les chantiers
      // précédents — un contexte fermé trop tôt interrompt une écriture
      // encore en vol).
      await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
      await page.goto(participantUrl).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.getByRole('button', { name: '···' }).click().catch(() => {});
      // Deux boutons "Supprimer" une fois le menu ouvert : celui du menu
      // (participant) et celui de la carte programme — scoper au menu via
      // sa classe Tailwind distinctive (w-52, ParticipantProfile.tsx).
      await page.locator('div.w-52').getByRole('button', { name: 'Supprimer', exact: true }).click().catch(() => {});
      await page.getByRole('button', { name: 'Supprimer définitivement' }).click().catch(() => {});
      await page.waitForURL(/\/($|\?)/, { timeout: 10000 }).catch(() => {});

      // ── Nettoyage : supprime le modèle de test ─────────────────────────
      // ModelesProgrammePage.tsx (ModeleCard) : le nom est précédé d'un
      // emoji dans le même texte ("📋 {modele.nom}") — `exact: true`
      // contre le seul nom ne matche donc jamais ici (à la différence
      // d'AppliquerModeleModal.tsx, sans emoji). Confirmation en 2 temps :
      // "Supprimer" affiche "Confirmer la suppression" à la place, pas de
      // modale séparée. Attend la disparition de la carte (pas seulement
      // le clic) avant de conclure : deleteModele() est asynchrone, un
      // clic sans attente a laissé un modèle orphelin pendant le
      // développement de ce test — le contexte se fermait avant la fin de
      // l'écriture.
      await page.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
      await page.goto('/bibliotheque').catch(() => {});
      await page.getByRole('button', { name: 'Modèles de programme' }).click().catch(() => {});
      const carteModeleNettoyage = page.getByText(nomModele, { exact: false }).locator('xpath=ancestor::div[2]');
      const present = await carteModeleNettoyage.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (present) {
        await carteModeleNettoyage.getByRole('button', { name: 'Supprimer', exact: true }).click().catch(() => {});
        await carteModeleNettoyage.getByRole('button', { name: 'Confirmer la suppression' }).click().catch(() => {});
        await carteModeleNettoyage.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      }
    }
  });
});
