import { test, expect } from '@playwright/test';
import { skipUnlessE2E } from './helpers.js';

// Chantier « fix PWA manifest » (2026-09-28) : ce domaine sert deux publics
// — le praticien (start_url "/") et le patient (start_url "/patient", voir
// EspacePatient.tsx:158-162, qui encourage explicitement "Sur l'écran
// d'accueil"). Un <link rel="manifest"> statique unique dans index.html
// (public/manifest.json, start_url "/patient") l'emportait toujours sur le
// manifeste praticien généré par VitePWA, quelle que soit la page ouverte :
// toute icône installée ouvrait l'espace patient, même pour un praticien.
//
// Correctif : index.html ne pose plus de <link rel="manifest"> statique —
// un script inline SYNCHRONE (pas de type="module", pas de defer/async)
// choisit et insère le bon lien selon location.pathname au moment du
// parsing du head, avant que Safari iOS ne puisse lire le manifeste au
// moment de "Sur l'écran d'accueil". Le lien que VitePWA injecte
// automatiquement au build est retiré après coup par
// scripts/pwa-manifest-postbuild.mjs — sans quoi il y aurait deux liens
// manifeste sur la même page, et le navigateur retiendrait le premier (le
// même bug, déplacé).
//
// Ce test vérifie le comportement runtime (le DOM après exécution du script
// inline), pas seulement le HTML statique — c'est le DOM que Safari lit.

test.describe('Manifeste PWA — choisi selon la route', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('sur /login, un seul <link rel="manifest">, start_url "/" (praticien)', async ({ page }) => {
    await page.goto('/login');

    const liens = page.locator('link[rel="manifest"]');
    await expect(liens).toHaveCount(1);

    const href = await liens.getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');

    const manifeste = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, href!);
    expect(manifeste.start_url).toBe('/');
    expect(manifeste.orientation).toBe('portrait');
  });

  test('sur /patient, un seul <link rel="manifest">, start_url "/patient" (Espace Patient)', async ({ page }) => {
    await page.goto('/patient');

    const liens = page.locator('link[rel="manifest"]');
    await expect(liens).toHaveCount(1);

    const href = await liens.getAttribute('href');
    expect(href).toBe('/manifest-patient.webmanifest');

    const manifeste = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, href!);
    expect(manifeste.start_url).toBe('/patient');
    expect(manifeste.name).toBe('Espace Patient');
    expect(manifeste.orientation).toBe('portrait');

    // Le flux patient documenté (EspacePatient.tsx:158-162) reste identique :
    // ce chantier ne touche à rien d'autre sur cet écran.
    await expect(page.locator('input, button').first()).toBeVisible();
  });

  test('sur /patient/:id, même manifeste patient (préfixe, pas correspondance exacte)', async ({ page }) => {
    await page.goto('/patient/id-inexistant-e2e');

    const liens = page.locator('link[rel="manifest"]');
    await expect(liens).toHaveCount(1);
    await expect(liens).toHaveAttribute('href', '/manifest-patient.webmanifest');
  });

  test('sur /, un seul <link rel="manifest">, start_url "/" (praticien)', async ({ page }) => {
    await page.goto('/');

    const liens = page.locator('link[rel="manifest"]');
    await expect(liens).toHaveCount(1);
    await expect(liens).toHaveAttribute('href', '/manifest.webmanifest');
  });
});
