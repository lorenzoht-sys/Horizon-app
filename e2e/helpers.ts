import { test, type Page } from '@playwright/test';

// Variables d'environnement de la suite E2E (Tâche 5 — consolidation).
// Voir e2e/README.md pour la procédure complète et
// supabase/migrations/SETUP_STAGING.md pour la mise en place de
// l'environnement de staging correspondant.

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? '';
export const E2E_ENABLED = Boolean(E2E_BASE_URL);

export const env = {
  praticienEmail: process.env.E2E_PRATICIEN_EMAIL ?? '',
  praticienPassword: process.env.E2E_PRATICIEN_PASSWORD ?? '',
  patientCode: process.env.E2E_PATIENT_CODE ?? 'camille2026',
  patientPrenom: process.env.E2E_PATIENT_PRENOM ?? 'Camille',
  patientNom: process.env.E2E_PATIENT_NOM ?? 'Martin',
  patientCode2: process.env.E2E_PATIENT_CODE_2 ?? 'julien2026',
  patientPrenom2: process.env.E2E_PATIENT_PRENOM_2 ?? 'Julien',
  patientNom2: process.env.E2E_PATIENT_NOM_2 ?? 'Bernard',
  structureToken: process.env.E2E_STRUCTURE_TOKEN ?? 'staging-token-demo-0001',
};

// Sans E2E_BASE_URL, aucun test ne peut s'exécuter (pas de déploiement à
// tester) : on les ignore plutôt que de les faire échouer, pour que la CI
// reste verte avant la mise en place de l'environnement de staging.
export function skipUnlessE2E() {
  test.skip(!E2E_ENABLED, 'E2E désactivé : définissez E2E_BASE_URL (voir e2e/README.md)');
}

// Tests nécessitant une session praticien (Supabase Auth).
export function skipUnlessPraticien() {
  skipUnlessE2E();
  test.skip(
    !env.praticienEmail || !env.praticienPassword,
    'E2E_PRATICIEN_EMAIL / E2E_PRATICIEN_PASSWORD non définis (voir e2e/README.md)'
  );
}

export async function loginPraticien(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('pierre@mouvapa.com').fill(env.praticienEmail);
  await page.getByPlaceholder('••••••••').fill(env.praticienPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('/');
}

// Depuis le tableau de bord, ouvre la fiche d'un participant via sa carte
// (qui affiche "{prénom} {nom}").
export async function ouvrirFicheParticipant(page: Page, nomComplet: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name: nomComplet }).click();
  await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
}
