import { test, expect, type Page } from '@playwright/test';

// Variables d'environnement de la suite E2E (Tâche 5 — consolidation).
// Voir e2e/README.md pour la procédure complète et
// supabase/migrations/SETUP_STAGING.md pour la mise en place de
// l'environnement de staging correspondant.

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? '';
export const E2E_ENABLED = Boolean(E2E_BASE_URL);

export const env = {
  praticienEmail: process.env.E2E_PRATICIEN_EMAIL ?? '',
  praticienPassword: process.env.E2E_PRATICIEN_PASSWORD ?? '',
  patientCode: process.env.E2E_PATIENT_CODE ?? 'CAME2E26',
  patientPrenom: process.env.E2E_PATIENT_PRENOM ?? 'Camille',
  patientNom: process.env.E2E_PATIENT_NOM ?? 'Martin',
  patientCode2: process.env.E2E_PATIENT_CODE_2 ?? 'JUNE2E27',
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

// Ciblage par label, pas par placeholder : le placeholder de ce formulaire a
// déjà changé une fois sans que la suite suive (`pierre@mouvapa.com` est
// devenu `vous@structure.fr`), ce qui a fait échouer 8 tests avec un
// `locator.fill: Test timeout` — un symptôme qui ne désigne pas sa cause.
// Un label est du texte visible par l'utilisateur : s'il change, le test doit
// changer aussi, et l'échec dit alors quelque chose de vrai sur l'interface.
export async function loginPraticien(page: Page): Promise<void> {
  await page.goto('/login');
  // `exact: true` sur le mot de passe : sans lui, le libellé capture aussi le
  // bouton œil « Afficher le mot de passe » (correspondance partielle sur
  // aria-label) et Playwright refuse l'ambiguïté en mode strict.
  await page.getByLabel('Email professionnel', { exact: true }).fill(env.praticienEmail);
  await page.getByLabel('Mot de passe', { exact: true }).fill(env.praticienPassword);

  // ── Pourquoi l'URL « / » ne prouve rien ─────────────────────────────────
  // Ce helper attendait `waitForURL('/')`. Or `showOnboarding` part de
  // `false` et n'est renseigné qu'APRÈS une requête (App.tsx:173, 288, 325) :
  // l'espace pro s'affiche donc pendant un instant, à l'URL « / », avant que
  // la redirection vers /onboarding ne s'applique. `waitForURL('/')` était
  // satisfait par cet état transitoire.
  //
  // Le 2026-09-14, le compte `staging.praticien2@example.com` n'avait pas de
  // `titre` : les dix tests partaient en réalité sur /onboarding, mais le
  // helper validait la connexion. Les échecs tombaient plus loin, sur des
  // « element(s) not found » qui désignaient l'affichage desktop — une piste
  // fausse suivie pendant plusieurs runs. Un helper qui valide à tort ne
  // retarde pas le diagnostic : il l'envoie ailleurs.
  //
  // On attend donc le signal qui décide, pas celui qui précède : la réponse de
  // la requête `titre` de `needsOnboarding`.
  //
  // Et on lit SON CONTENU plutôt que d'observer la redirection qui en découle.
  // Première version de ce helper : après la réponse, elle testait
  // `page.url()`. C'était encore une course — React doit re-rendre et naviguer
  // APRÈS la réponse, si bien que l'URL était toujours « / » au moment du
  // test. Le helper levait quand même, mais sur l'assertion suivante, avec un
  // message qui ne nommait pas la cause : le défaut exact qu'il corrige.
  // Constaté par le test 14 au premier run en CI (2026-09-14).
  //
  // Le corps de la réponse, lui, EST la décision : `needsOnboarding` renvoie
  // `!data?.titre`. Pas de délai, pas d'attente à l'aveugle sur le chemin
  // nominal.
  const decisionOnboarding = page
    .waitForResponse(
      r => /\/rest\/v1\/praticiens\b/.test(r.url()) && /select=titre/.test(r.url()),
      { timeout: 20_000 }
    )
    .catch(() => null); // pas de requête observée : on retombe sur le contrôle positif

  await page.getByRole('button', { name: 'Se connecter' }).click();
  const reponse = await decisionOnboarding;
  const praticien = reponse
    ? await (reponse.json() as Promise<{ titre?: string | null } | null>).catch(() => null)
    : null;

  // `praticien` nul = réponse illisible ou absente : on ne conclut rien ici, le
  // contrôle positif ci-dessous tranchera. Ligne absente (`.single()` en erreur)
  // ou titre vide : les deux envoient vers /onboarding.
  if (reponse && (!praticien || !praticien.titre)) {
    throw new Error(
      `Connexion partie sur /onboarding : le compte ${env.praticienEmail} n'a pas de ` +
        '`titre` dans `praticiens` (needsOnboarding, App.tsx). Renseigner le titre du ' +
        'compte de test avant de relancer la suite — voir ' +
        'scripts/staging-renseigner-titre-praticien.ts.'
    );
  }

  // Signal positif : l'espace pro est réellement monté. La Sidebar n'existe
  // ni sur /login ni sur /onboarding.
  await expect(page.getByRole('link', { name: 'Tableau de bord' })).toBeVisible({ timeout: 20_000 });
}

// Depuis le tableau de bord, ouvre la fiche d'un participant via sa carte
// (qui affiche "{prénom} {nom}").
export async function ouvrirFicheParticipant(page: Page, nomComplet: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('heading', { name: nomComplet }).click();
  await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
}
