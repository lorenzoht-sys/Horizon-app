import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, ouvrirFicheParticipant, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Vérification de non-régression pour l'extraction de ConfigIAModal /
// PreviewIAModal + useProgrammeIA() (chantier « Programme — génération
// assistée par IA (mobile) ») : le flux desktop existant (bouton "Générer
// avec l'IA", ProgrammePage.tsx) n'était couvert par AUCUN test avant ce
// chantier. Comble ce trou de couverture plutôt que de se fier à une
// vérification manuelle.
//
// api/claude.ts appelle réellement l'API Anthropic (coût facturé). Mocké
// via page.route() (pattern établi dans 14-helper-login-onboarding.spec.ts)
// — voir e2e/mobile/24-generation-ia-mobile.spec.ts pour la même
// justification détaillée.

const CANNED_QUESTIONS = JSON.stringify({ questions: ['Le bénéficiaire a-t-il peur de tomber ?'] });
const CANNED_PROGRAMME = JSON.stringify({
  nom: 'Programme Équilibre généré desktop',
  objectif: 'Réduire le risque de chute',
  message_motivation: 'Vous allez y arriver !',
  niveau_global: 2,
  seances: [{
    nom: 'Séance A',
    exercices: [
      { nom: 'Équilibre unipodal', categorie: 'equilibre', description: 'Tenez-vous sur un pied', niveau: 2, series: 3, repetitions: null, duree_secondes: 20 },
    ],
  }],
  planning: { lundi: 'Séance A', mardi: 'repos', mercredi: 'repos', jeudi: 'repos', vendredi: 'repos', samedi: 'repos', dimanche: 'repos' },
  conseils_generaux: 'Hydratez-vous bien avant chaque séance.',
});

test.describe('Génération de programme par IA (desktop)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un praticien peut générer, ajuster et créer un programme via l\'IA', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/claude', route => {
      callCount++;
      const text = callCount === 1 ? CANNED_QUESTIONS : CANNED_PROGRAMME;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text }) });
    });

    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);
    await page.goto(`${page.url()}/programme`);

    try {
      await page.getByRole('button', { name: "Générer avec l'IA" }).click();
      await expect(page.getByText('Le bénéficiaire a-t-il peur de tomber ?')).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: 'Générer le programme' }).click();
      await expect(page.getByText("L'IA génère le programme…")).toBeVisible();
      await expect(page.getByText('Programme généré — à valider')).toBeVisible({ timeout: 10000 });

      // Édition (nom) puis validation.
      const nomInput = page.locator('input[value="Programme Équilibre généré desktop"]');
      await nomInput.fill('Programme Équilibre généré desktop (édité)');
      await page.getByRole('button', { name: '✅ Valider et créer le programme' }).click();
      await expect(page.getByText('Programme généré et créé avec succès 🎉')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Programme Équilibre généré desktop (édité)')).toBeVisible({ timeout: 10000 });
    } finally {
      const admin = clientAdminTest();
      if (admin) {
        const { data } = await admin.from('programmes').select('id').eq('titre', 'Programme Équilibre généré desktop (édité)').limit(1);
        if (data?.[0]?.id) await admin.from('programmes').delete().eq('id', data[0].id);
      }
    }
  });

  test('erreur réseau et validation invalide : messages clairs, pas de blocage', async ({ page }) => {
    await page.route('**/api/claude', route => {
      route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: "Le service d'analyse est momentanément indisponible" }) });
    });

    await loginPraticien(page);
    await ouvrirFicheParticipant(page, `${env.patientPrenom2} ${env.patientNom2}`);
    await page.goto(`${page.url()}/programme`);

    await page.getByRole('button', { name: "Générer avec l'IA" }).click();
    await expect(page.getByText("Générer un programme avec l'IA")).toBeVisible();
    // Le chargement des questions échoue aussi (même mock) — non bloquant.
    await expect(page.getByText('Aucune question complémentaire')).toBeVisible({ timeout: 10000 });

    // Validation synchrone AVANT tout appel réseau (correctif : ne doit
    // jamais faire apparaître, même brièvement, l'écran "generating" —
    // voir genererProgrammeIA() dans ProgrammePage.tsx).
    await page.getByRole('combobox').first().selectOption('personnalise');
    await page.getByRole('button', { name: 'Générer le programme' }).click();
    await expect(page.getByText("Précisez l'objectif personnalisé.")).toBeVisible();
    await expect(page.getByText("L'IA génère le programme…")).not.toBeVisible();

    // Erreur réseau (appel réel, une fois la validation satisfaite).
    await page.getByRole('combobox').first().selectOption('equilibre');
    await page.getByRole('button', { name: 'Générer le programme' }).click();
    await expect(page.getByText(/Erreur API Claude|indisponible/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Générer le programme' })).toBeVisible();
  });
});
