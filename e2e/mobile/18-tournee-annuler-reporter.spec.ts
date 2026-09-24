import { test, expect, type Page } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';

// Chantier « Tournée mobile — annuler et reporter » : EcranTournee
// (AppMobile.tsx) n'offrait que « Marquer réalisée ». « Annuler » et
// « Reporter » existent côté desktop :
//   - « Annuler » : TourneePage.tsx (bouton ✕), via changerStatut(id, 'annulee'),
//     sans confirmation ni raison obligatoire — réutilisé tel quel ici,
//     avec une confirmation légère en plus (écran tactile, coût d'un tap
//     accidentel plus élevé qu'un clic souris précis).
//   - « Reporter » n'a PAS d'entrée UI desktop atteignable aujourd'hui —
//     son bouton a été retiré du sous-écran de ModalEditSeance
//     (AgendaV2Page.tsx, commit 356beb6, « gardés intacts pour un usage
//     futur ») sans supprimer le mécanisme lui-même (handleReporterSeance) :
//     la séance d'origine passe "reportee" SANS changer de date (trace
//     historique), une nouvelle séance "planifiee" est créée à la date
//     choisie, même heure. Reproduit ici à l'identique (modifierSeance +
//     creerSeance, pas changerStatut, pour avoir le retour de succès avant
//     de créer la seconde séance).
//
// La création de la séance de test passe par /agenda-v2 (desktop, viewport
// temporaire comme 13-rotation-portrait-paysage.spec.ts et
// 17-cours-collectifs-mobile.spec.ts) — EcranTournee ne crée pas de séance
// (hors périmètre de ce chantier).

function barreNav(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

async function creerSeanceDeTest(page: Page, heureDebut: string): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/agenda-v2');
  await page.getByRole('button', { name: /Nouvelle séance/ }).click();
  const modale = page.locator('.rounded-2xl.shadow-xl.max-w-md');
  await modale.getByRole('combobox').first().selectOption({ label: `${env.patientPrenom} ${env.patientNom}` });
  await modale.locator('input[type="time"]').fill(heureDebut);
  // Durée réduite (15 min) : moins de risque de chevaucher une vraie
  // séance de Camille déjà planifiée aujourd'hui (le formulaire refuse un
  // conflit horaire).
  await modale.locator('input[type="number"]').fill('15');
  await modale.getByRole('button', { name: 'Créer la séance' }).click();
  await expect(page.getByText('Séance créée')).toBeVisible({ timeout: 10000 });
  await page.setViewportSize({ width: 390, height: 844 });
}

function carteSeance(page: Page, heureDebut: string) {
  // Le nom et l'heure sont dans un petit conteneur interne qui n'englobe
  // PAS les boutons d'action (eux dans une div sœur plus bas) : filtrer sur
  // heureDebut (unique par test) + un texte présent dans CHAQUE carte mais
  // seulement au niveau de la carte entière (le bouton "Marquer réalisée")
  // pour que `.last()` (le plus profond des deux) résolve la carte
  // complète, pas le seul bloc nom+heure.
  return page.locator('div')
    .filter({ hasText: heureDebut })
    .filter({ hasText: 'Marquer réalisée' })
    .last();
}

test.describe('Tournée mobile — annuler et reporter une séance', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('annuler une séance depuis mobile, avec confirmation, sans raison obligatoire', async ({ page }) => {
    const heureDebut = '05:00';
    await loginPraticien(page);
    await creerSeanceDeTest(page, heureDebut);

    try {
      await page.goto('/tournee');
      const carte = carteSeance(page, heureDebut);
      await expect(carte).toBeVisible();

      await carte.getByRole('button', { name: /Annuler/ }).click();

      // Confirmation obligatoire : aucun changement avant validation.
      await expect(page.getByText('Annuler cette séance ?')).toBeVisible();
      await page.getByRole('button', { name: 'Confirmer' }).click();

      // Signal de complétion fiable avant tout rechargement (leçon du
      // chantier précédent) : l'overlay ne se ferme qu'après la résolution
      // de changerStatut — pas de toast à côté duquel on pourrait recharger
      // trop tôt puisque celui-ci arrive avant la fermeture, dans le même
      // awaited flow.
      await expect(page.getByText('Annuler cette séance ?')).toBeHidden({ timeout: 10000 });
      await expect(page.getByText('Séance annulée')).toBeVisible();

      // Reflété sans rechargement manuel : PAS de badge « Annulée » — la
      // carte disparaît de la tournée du jour. seancesDuJour (useAgenda.ts,
      // non modifié) exclut déjà les séances annulées de `seances`,
      // exactement comme sur desktop (TourneePage.tsx utilise la même
      // fonction) : une séance annulée n'est plus une action à faire
      // aujourd'hui.
      await expect(carteSeance(page, heureDebut)).toHaveCount(0);

      // Persistance réelle (pas seulement l'état local) : après un rechargement.
      await page.reload();
      await expect(carteSeance(page, heureDebut)).toHaveCount(0);
    } finally {
      // Filet de sécurité : si une assertion a échoué avant la
      // confirmation, la séance de test resterait "planifiee" sinon.
      const carteRestante = carteSeance(page, heureDebut);
      if (await carteRestante.isVisible().catch(() => false)) {
        await carteRestante.getByRole('button', { name: /Annuler/ }).click().catch(() => {});
        await page.getByRole('button', { name: 'Confirmer' }).click().catch(() => {});
        // Attendre la fin de l'écriture avant de laisser le test se
        // terminer (même piège que le filet de l'autre test : un contexte
        // navigateur fermé trop tôt peut interrompre l'écriture en vol).
        await page.getByText('Annuler cette séance ?').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      }
    }
  });

  test('reporter une séance depuis mobile crée une nouvelle séance à la date choisie', async ({ page }) => {
    const heureDebut = '05:30';
    await loginPraticien(page);
    await creerSeanceDeTest(page, heureDebut);

    const dateReport = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return d.toISOString().slice(0, 10);
    })();

    try {
      await page.goto('/tournee');
      const carte = carteSeance(page, heureDebut);
      await expect(carte).toBeVisible();

      await carte.getByRole('button', { name: /Reporter/ }).click();
      await expect(page.getByText('Reporter cette séance')).toBeVisible();
      await page.locator('input[type="date"]').fill(dateReport);
      await page.getByRole('button', { name: 'Confirmer le report' }).click();

      // Signal de complétion fiable : l'overlay ne se ferme qu'après la
      // résolution de modifierSeance ET de creerSeance (confirmerReport).
      await expect(page.getByText('Reporter cette séance')).toBeHidden({ timeout: 10000 });

      // Reflété sans rechargement manuel, dans la tournée du jour (la
      // séance d'origine garde SA date, seul son statut change).
      await expect(carteSeance(page, heureDebut)).toContainText('🔄 Reportée');

      // Persistance réelle.
      await page.reload();
      await expect(carteSeance(page, heureDebut)).toContainText('🔄 Reportée');

      // Vérifie la nouvelle séance à la nouvelle date (TourneePage desktop,
      // seul endroit avec un sélecteur de date — EcranTournee mobile n'en a
      // pas, hors périmètre de ce chantier).
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto('/tournee');
      await page.locator('input[type="date"]').fill(dateReport);
      // Même piège qu'en mobile : nom + heure sont dans un conteneur qui
      // n'englobe pas les boutons d'action (TourneePage.tsx, structure
      // différente d'EcranTournee mais même limite). "Réalisée" (texte du
      // bouton, visible tant que le statut n'est pas déjà "realisee") sert
      // de second repère pour que `.last()` remonte jusqu'à la carte entière.
      const nouvelleCarte = page.locator('div')
        .filter({ hasText: heureDebut })
        .filter({ hasText: 'Réalisée' })
        .last();
      await expect(nouvelleCarte).toBeVisible();
      await expect(nouvelleCarte).toContainText('Planifiée');

      // Nettoyage de la nouvelle séance (celle créée par le report,
      // "planifiee" à une date future — sans ça, elle resterait comme un
      // vrai rendez-vous fictif). Signal de complétion fiable : comme sur
      // mobile, seancesDuJour exclut déjà les séances annulées, la carte
      // disparaît donc du DOM une fois l'écriture confirmée — pas de toast
      // à côté duquel recharger trop tôt (TourneePage.tsx l'affiche AVANT
      // la fin de l'écriture, sans l'attendre).
      await nouvelleCarte.getByRole('button', { name: 'Annuler' }).click();
      await expect(page.locator('div').filter({ hasText: heureDebut }).filter({ hasText: 'Réalisée' })).toHaveCount(0, { timeout: 10000 });
    } finally {
      // Filet de sécurité, y compris si une assertion a échoué plus haut :
      // annule aussi la séance d'ORIGINE (aujourd'hui, "reportee").
      // Contrairement à "annulee", seancesDuJour (useAgenda.ts) ne la
      // masque PAS — elle resterait donc visible indéfiniment sinon.
      // Toujours atteignable : "Annuler" reste proposé tant que le statut
      // n'est ni "annulee" ni "realisee" (gating de la carte mobile).
      await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
      await page.goto('/tournee').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      const origine = carteSeance(page, heureDebut);
      // `.waitFor` (pas `.isVisible()` instantané) : laisse le temps à la
      // page de s'hydrater après `goto` — un `isVisible()` immédiat après
      // navigation a déjà fait manquer ce nettoyage une fois (carte pas
      // encore montée, jugée absente à tort).
      const present = await origine.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (present) {
        await origine.getByRole('button', { name: /Annuler/ }).click().catch(() => {});
        await page.getByRole('button', { name: 'Confirmer' }).click().catch(() => {});
        // Attendre la fermeture de l'overlay AVANT de laisser le test se
        // terminer : sans ça, le test (et son contexte navigateur) se
        // termine avant que l'écriture Supabase, encore en vol, n'ait pu
        // aboutir — exactement le piège que ce filet est censé éviter.
        await page.getByText('Annuler cette séance ?').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      }
    }
  });
});
