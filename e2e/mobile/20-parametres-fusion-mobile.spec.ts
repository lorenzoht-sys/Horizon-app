import { test, expect, type Page } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from '../helpers.js';

// Chantier « fusion des paramètres » : /settings n'est PAS ajoutée à
// estRouteInterfaceUnique (src/lib/routesMobile.ts) — contrairement à
// /archives et /participant/:id/bilan/:bilanId — car DesktopContent affiche
// BarreNavigationMobile sans possibilité de l'exclure route par route, ce
// qui aurait cassé l'absence volontaire de barre sur cet écran de
// formulaire (avecBarre=false, confirmée dans plusieurs chantiers
// précédents). La fusion se fait donc au niveau du composant : le
// `case 'parametres'` d'AppMobile.tsx rend désormais SettingsPage
// directement (import direct, plus d'EcranSettings dupliqué), avec un lien
// de retour ajouté dans SettingsPage.tsx lui-même (même patron que
// ArchivesPage.tsx / BilanDetail.tsx) puisque ni Sidebar ni
// BarreNavigationMobile ne sont disponibles ici pour naviguer en arrière.
//
// Ce test ne couvre que l'accessibilité des sections absentes de l'ancien
// EcranSettings (adresse professionnelle, rappels, export ICS) — la
// couverture fonctionnelle détaillée (validation, sauvegarde) reste dans
// les specs desktop (voir e2e/*.spec.ts pour SettingsPage).

function barreNav(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

test.describe('Fusion des paramètres sur mobile (390×844)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('adresse professionnelle, rappels et export ICS sont accessibles', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', err => erreurs.push(`pageerror: ${err.message}`));

    await loginPraticien(page);
    await barreNav(page).getByRole('button', { name: 'Plus' }).click();
    await page.getByRole('button', { name: 'Paramètres' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Lien de retour (remplace Sidebar/BarreNavigationMobile, absentes ici)
    await expect(page.getByRole('link', { name: /Tableau de bord/ })).toBeVisible();

    // ── Adresse professionnelle : absente de l'ancien EcranSettings ──────
    // `getByLabel` ne fonctionne pas ici : le composant `Field` (SettingsPage.tsx)
    // affiche un <label> non associé à l'input (pas de htmlFor/id, pas de
    // wrapping) — repéré en écrivant ce test, vérifié par exécution réelle.
    await expect(page.getByText('Adresse (rue)')).toBeVisible();
    const adresseRue = page.getByPlaceholder('12 rue des Lilas');
    await adresseRue.scrollIntoViewIfNeeded();
    await expect(adresseRue).toBeVisible();
    await expect(adresseRue).toBeEditable();

    // ── Rappels automatiques (SectionRappelsGlobal) ───────────────────────
    const rappelToggle = page.getByText('Rappel avant la séance');
    await rappelToggle.scrollIntoViewIfNeeded();
    await expect(rappelToggle).toBeVisible();

    // ── Export du planning (SectionExportPlanning, ICS/webcal) ───────────
    // Deux états possibles selon que `praticiens.token_planning_ics` est
    // déjà renseigné sur ce compte de test (aucun bouton de désactivation
    // n'existe dans l'UI, seulement « Régénérer » — vérifié en lisant
    // SectionExportPlanning, SettingsPage.tsx) : le titre de section, lui,
    // est présent dans les deux cas et suffit à couvrir l'accessibilité.
    const titreExportPlanning = page.getByText('Export du planning');
    await titreExportPlanning.scrollIntoViewIfNeeded();
    await expect(titreExportPlanning).toBeVisible();
    const activerBtn = page.getByRole('button', { name: 'Activer l\'export du planning' });
    const regenererBtn = page.getByRole('button', { name: 'Régénérer le lien' });
    const dejaActif = await regenererBtn.isVisible().catch(() => false);
    await expect(dejaActif ? regenererBtn : activerBtn).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, 'SettingsPage ne doit pas déborder horizontalement à 390px').toBe(false);

    expect(erreurs, erreurs.join('\n')).toEqual([]);
  });
});
