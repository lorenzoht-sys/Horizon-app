import { test, expect, type Page } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';

// Tests de fumée du projet Playwright "Mobile" (viewport 390×844, voir
// playwright.config.ts) — fondation avant les chantiers de fusion
// mobile/desktop (archivés, cours collectifs, tournée, bilan…).
//
// Ce ne sont PAS des tests exhaustifs : un test par écran listé dans le
// chantier, qui vérifie seulement que l'écran se charge sans erreur
// console, que son élément principal est visible, et que
// BarreNavigationMobile (src/components/layout/BarreNavigationMobile.tsx)
// est présente et utilisable. La couverture fonctionnelle détaillée reste
// dans les specs desktop numérotées (01 à 14).
//
// EcranPaysage (bascule desktop en dessous de 768 px) est hors périmètre —
// voir le chantier.

// Bruit connu, indépendant de l'écran testé : `extraHTTPHeaders` (le bypass
// de la protection de déploiement Vercel, voir playwright.config.ts)
// s'applique à TOUTE requête sortante, y compris celles vers les polices
// tierces (Google Fonts, cdn.jsdelivr.net). Ces origines ne whitelistent pas
// l'en-tête `x-vercel-set-bypass-cookie` dans leur préflight CORS, qui
// échoue donc systématiquement — sur desktop comme sur mobile, avant même
// ce chantier. Aucune spec desktop ne vérifiait la console jusqu'ici, ce
// bruit était invisible. Ignoré ici pour ne garder que les vraies erreurs.
function estBruitCorsPolicesTierces(texte: string): boolean {
  return (
    (texte.includes('blocked by CORS policy') && texte.includes('x-vercel-set-bypass-cookie')) ||
    texte === 'Failed to load resource: net::ERR_FAILED'
  );
}

function ecouterErreursConsole(page: Page): string[] {
  const erreurs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !estBruitCorsPolicesTierces(msg.text())) erreurs.push(msg.text());
  });
  page.on('pageerror', err => erreurs.push(`pageerror: ${err.message}`));
  return erreurs;
}

function barreNav(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

test.describe('Fumée mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('connexion puis affichage de l\'accueil (EcranAujourdhui)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await expect(page.getByText(/Bonjour /)).toBeVisible();
    await expect(barreNav(page)).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('navigation vers la liste des bénéficiaires (EcranPatients)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await barreNav(page).getByRole('button', { name: 'Bénéfic.' }).click();

    await expect(page).toHaveURL(/\?onglet=beneficiaires/);
    await expect(page.getByText('Mes bénéficiaires')).toBeVisible();
    await expect(barreNav(page)).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('ouverture d\'une fiche bénéficiaire (ParticipantProfile, route fusionnée)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await barreNav(page).getByRole('button', { name: 'Bénéfic.' }).click();
    await page.getByText(`${env.patientPrenom} ${env.patientNom}`).first().click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);

    // Route fusionnée (estRouteInterfaceUnique, src/lib/routesMobile.ts) :
    // même composant qu'en desktop, servi par le cadre commun (App.tsx).
    await expect(page.getByRole('heading', { name: `${env.patientPrenom} ${env.patientNom}` })).toBeVisible();
    await expect(barreNav(page)).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('navigation vers la tournée (EcranTournee)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await barreNav(page).getByRole('button', { name: 'Tournée' }).click();

    await expect(page).toHaveURL(/\/tournee$/);
    await expect(page.getByText('Ma tournée')).toBeVisible();
    await expect(barreNav(page)).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('navigation vers les paramètres (SettingsPage fusionné)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await barreNav(page).getByRole('button', { name: 'Plus' }).click();
    await page.getByRole('button', { name: 'Paramètres' }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText('Paramètres', { exact: true })).toBeVisible();
    // Exception volontaire, confirmée dans plusieurs chantiers (dont la
    // fusion des paramètres, AppMobile.tsx case 'parametres') : écran de
    // formulaire, avecBarre=false — contrairement à tous les autres écrans
    // de ce fichier, la barre de navigation NE doit PAS être visible ici.
    // Cette assertion vérifiait auparavant `toBeVisible()`, ce qui ne
    // correspondait pas au comportement réel de l'app (échec pré-existant).
    await expect(barreNav(page)).toBeHidden();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  // Chantier « retrait de l'Assistant de la navigation mobile » :
  // l'assistant sort du périmètre mobile (décision produit), EcranAssistant
  // et /assistant restent en place (retrait complet prévu séparément, plus
  // tard) — seuls ses points d'entrée mobile disparaissent : cette barre
  // (BarreNavigationMobile.tsx) et le bouton "Assistant" de la fiche
  // bénéficiaire (ParticipantProfile.tsx, masqué sous 768px, pas retiré :
  // encore utilisé par le desktop).
  test('barre de navigation : "Assistant" retiré, 5 onglets restants', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await expect(barreNav(page).getByRole('button', { name: 'Assistant' })).toHaveCount(0);
    await expect(barreNav(page).getByRole('button')).toHaveCount(5);
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('EcranAssistant reste accessible par lien direct (/assistant), hors barre', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);
    // Laisse les requêtes initiales de l'accueil se terminer avant de
    // renaviguer : sinon page.goto() les annule en plein vol
    // (net::ERR_ABORTED), remonté par supabase-js en "Failed to fetch" —
    // même piège que 19-bilan-detail-mobile.spec.ts.
    await page.waitForLoadState('networkidle');

    await page.goto('/assistant');

    // `exact: true` : « Mon assistant » (sans préciser) matche aussi le titre
    // de l'état vide « Mon assistant APA » (AppMobile.tsx, EcranAssistant).
    await expect(page.getByText('🤖 Mon assistant', { exact: true })).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });
});
