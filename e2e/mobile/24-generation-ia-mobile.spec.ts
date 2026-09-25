import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from '../helpers.js';

// Chantier « Programme — génération assistée par IA (mobile) » : troisième
// et dernier des trois chemins de création de programme (après le wizard
// manuel, PR #87/#88, et l'application de modèle, PR #85). ConfigIAModal
// et PreviewIAModal (déjà existants côté desktop, ProgrammePage.tsx)
// n'avaient aucun point d'entrée mobile — /participant/:id/programme est
// une route desktop-only (routesMobile.ts), comme pour le wizard et le
// modèle avant leurs propres correctifs. Ouvre maintenant les mêmes écrans
// directement depuis la fiche fusionnée (ParticipantProfile.tsx).
//
// api/claude.ts appelle réellement l'API Anthropic (coût facturé, non
// négligeable pour la génération — prompt jusqu'à ~30k caractères,
// max_tokens 8192). Ce test mocke /api/claude via page.route() (déjà le
// pattern établi dans 14-helper-login-onboarding.spec.ts) : zéro coût,
// déterministe, teste l'orchestration UI — pas le contenu généré par
// l'IA, déjà couvert par les tests unitaires de genererProgrammeIA.ts.

const CANNED_QUESTIONS = JSON.stringify({
  questions: ['Le bénéficiaire a-t-il peur de tomber ?', 'Utilise-t-il une aide technique à la marche ?'],
});
const CANNED_PROGRAMME = JSON.stringify({
  nom: 'Programme Équilibre généré',
  description: 'Programme généré par IA pour la vérification e2e.',
  objectif: 'Réduire le risque de chute',
  message_motivation: 'Vous allez y arriver !',
  niveau_global: 2,
  seances: [
    {
      nom: 'Séance A',
      description: 'Équilibre debout',
      exercices: [
        { nom: 'Équilibre unipodal', categorie: 'equilibre', description: 'Tenez-vous sur un pied', niveau: 2, series: 3, repetitions: null, duree_secondes: 20 },
        { nom: 'Marche en tandem', categorie: 'equilibre', description: '10 pas', niveau: 2, series: 3, repetitions: 10, duree_secondes: null },
      ],
    },
  ],
  planning: { lundi: 'Séance A', mardi: 'repos', mercredi: 'Séance A', jeudi: 'repos', vendredi: 'repos', samedi: 'repos', dimanche: 'repos' },
  conseils_generaux: 'Hydratez-vous bien avant chaque séance.',
});

async function creerParticipantDedie(page: import('@playwright/test').Page, prenom: string, nom: string) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/participants/nouveau');
  await page.getByPlaceholder('Jean', { exact: true }).fill(prenom);
  await page.getByPlaceholder('Dupont', { exact: true }).fill(nom);
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
  return page.url();
}

async function supprimerParticipant(page: import('@playwright/test').Page, participantUrl: string) {
  await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
  await page.goto(participantUrl).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('button', { name: '···' }).click().catch(() => {});
  await page.locator('div.w-52').getByRole('button', { name: 'Supprimer', exact: true }).click().catch(() => {});
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click().catch(() => {});
  await page.waitForURL(/\/($|\?)/, { timeout: 10000 }).catch(() => {});
}

test.describe('Génération de programme par IA — mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('config → clarification → génération → preview (réorganisation) → validation', async ({ page }) => {
    test.setTimeout(60000);
    const prenomP = 'E2E';
    const nomP = `IA${Date.now()}`;

    let callCount = 0;
    await page.route('**/api/claude', route => {
      callCount++;
      const text = callCount === 1 ? CANNED_QUESTIONS : CANNED_PROGRAMME;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text }) });
    });

    await loginPraticien(page);
    const participantUrl = await creerParticipantDedie(page, prenomP, nomP);

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');
      const urlAvant = page.url();

      await page.getByRole('button', { name: "Générer avec l'IA" }).click();
      await expect(page.getByText("Générer un programme avec l'IA")).toBeVisible();
      // Questions de clarification chargées (mock) avant que la config soit utilisable.
      await expect(page.getByText('Le bénéficiaire a-t-il peur de tomber ?')).toBeVisible({ timeout: 10000 });

      const overflowConfig = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflowConfig, 'config IA : pas de défilement horizontal à 390px').toBe(false);

      await page.getByRole('button', { name: 'Générer le programme' }).click();
      // État d'attente explicite pendant l'appel IA (mock, mais le state
      // "generating" passe bien avant l'affichage de la preview).
      await expect(page.getByText("L'IA génère le programme…")).toBeVisible();

      await expect(page.getByText('Programme généré — à valider')).toBeVisible({ timeout: 10000 });

      const overflowPreview = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflowPreview, 'preview IA : pas de défilement horizontal à 390px').toBe(false);

      // Édition limitée : nom et message motivant sont des inputs texte.
      const nomInput = page.locator('input[value="Programme Équilibre généré"]');
      await expect(nomInput).toBeVisible();
      await nomInput.fill('Programme Équilibre généré (modifié)');

      // Réorganisation tactile (▲/▼, pas le drag-and-drop desktop) : le
      // second exercice ("Marche en tandem") passe en premier.
      await expect(page.getByText('Équilibre unipodal')).toBeVisible();
      await expect(page.getByText('Marche en tandem')).toBeVisible();
      const boutonsMonter = page.getByRole('button', { name: 'Monter' });
      await expect(boutonsMonter).toHaveCount(2);
      await boutonsMonter.last().click();
      // Vérifie l'ORDRE via la position verticale plutôt qu'un sélecteur de
      // style fragile : "Marche en tandem" doit maintenant précéder
      // "Équilibre unipodal".
      const yTandem = await page.getByText('Marche en tandem').boundingBox();
      const yUnipodal = await page.getByText('Équilibre unipodal').boundingBox();
      expect(yTandem?.y ?? Infinity, 'Marche en tandem doit être au-dessus après réorganisation').toBeLessThan(yUnipodal?.y ?? -Infinity);

      await page.getByRole('button', { name: '✅ Valider et créer le programme' }).click();
      await expect(page.getByText('Programme généré et créé avec succès 🎉')).toBeVisible({ timeout: 10000 });

      expect(page.url(), 'aucune navigation attendue après création').toBe(urlAvant);
      await expect(page.getByText('Programme Équilibre généré (modifié)')).toBeVisible({ timeout: 10000 });
    } finally {
      await supprimerParticipant(page, participantUrl);
    }
  });

  test('erreur réseau : message clair, pas de blocage', async ({ page }) => {
    test.setTimeout(60000);
    const prenomP = 'E2E';
    const nomP = `IAErr${Date.now()}`;

    await page.route('**/api/claude', route => {
      route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: "Le service d'analyse est momentanément indisponible" }) });
    });

    await loginPraticien(page);
    const participantUrl = await creerParticipantDedie(page, prenomP, nomP);

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: "Générer avec l'IA" }).click();
      await expect(page.getByText("Générer un programme avec l'IA")).toBeVisible();
      // Le chargement des questions échoue aussi (même mock) — non bloquant,
      // la config reste utilisable (voir ouvrirConfigIA, catch silencieux).
      await expect(page.getByText('Aucune question complémentaire')).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: 'Générer le programme' }).click();
      await expect(page.getByText(/Erreur API Claude|indisponible/)).toBeVisible({ timeout: 10000 });
      // Pas de blocage : la config reste ouverte et réutilisable.
      await expect(page.getByRole('button', { name: 'Générer le programme' })).toBeVisible();
    } finally {
      await supprimerParticipant(page, participantUrl);
    }
  });

  test('réponse invalide (JSON incorrect) : message clair, pas de blocage', async ({ page }) => {
    test.setTimeout(60000);
    const prenomP = 'E2E';
    const nomP = `IAInvalide${Date.now()}`;

    // Distinct du test "erreur réseau" ci-dessus : ici la requête RÉUSSIT
    // (200 OK) mais le texte renvoyé n'est pas un JSON exploitable — cas
    // réel possible côté Anthropic (troncature, dérive du modèle), géré
    // par un catch JSON.parse séparé dans genererProgrammeIA.ts.
    let callCount = 0;
    await page.route('**/api/claude', route => {
      callCount++;
      const text = callCount === 1 ? CANNED_QUESTIONS : "Ceci n'est pas du JSON valide {{{";
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text }) });
    });

    await loginPraticien(page);
    const participantUrl = await creerParticipantDedie(page, prenomP, nomP);

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(participantUrl);
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: "Générer avec l'IA" }).click();
      await expect(page.getByText('Le bénéficiaire a-t-il peur de tomber ?')).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: 'Générer le programme' }).click();
      await expect(page.getByText('renvoyé une réponse invalide')).toBeVisible({ timeout: 10000 });
      // Pas de blocage : la config reste ouverte et réutilisable, pas
      // rejetée sur l'écran de la fiche.
      await expect(page.getByRole('button', { name: 'Générer le programme' })).toBeVisible();
    } finally {
      await supprimerParticipant(page, participantUrl);
    }
  });
});
