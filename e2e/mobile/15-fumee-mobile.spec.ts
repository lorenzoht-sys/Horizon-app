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

  test('navigation vers les paramètres (EcranSettings)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await barreNav(page).getByRole('button', { name: 'Plus' }).click();
    await page.getByRole('button', { name: 'Paramètres' }).click();

    await expect(page).toHaveURL(/\/settings$/);
    // `exact: true` : la recherche de texte de Playwright est insensible à la
    // casse — « Paramètres » (sans préciser) matche aussi « … et paramètres
    // sont conservés » dans le texte de la zone danger plus bas sur l'écran.
    await expect(page.getByText('Paramètres', { exact: true })).toBeVisible();
    await expect(barreNav(page)).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });

  test('navigation vers l\'assistant (EcranAssistant)', async ({ page }) => {
    const erreurs = ecouterErreursConsole(page);
    await loginPraticien(page);

    await barreNav(page).getByRole('button', { name: 'Assistant' }).click();

    await expect(page).toHaveURL(/\/assistant$/);
    // `exact: true` : « Mon assistant » (sans préciser) matche aussi le titre
    // de l'état vide « Mon assistant APA » (AppMobile.tsx, EcranAssistant).
    await expect(page.getByText('🤖 Mon assistant', { exact: true })).toBeVisible();
    await expect(barreNav(page)).toBeVisible();
    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });
});
