import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien } from './helpers.js';

// Prouve que `loginPraticien` REFUSE une connexion qui part en onboarding,
// au lieu de la valider silencieusement.
//
// Le 2026-09-14, le compte `staging.praticien2@example.com` n'avait pas de
// `titre` : l'application redirigeait vers /onboarding après connexion, et
// le helper — qui attendait seulement `waitForURL('/')` — laissait passer.
// Dix tests échouaient ensuite sur des éléments introuvables, un symptôme
// qui désignait l'affichage desktop et non la vraie cause.
//
// ── Pourquoi forcer la réponse plutôt qu'utiliser un compte sans titre ───
// Ce test doit rester vrai APRÈS la correction de la donnée sur staging : à
// ce moment-là, plus aucun compte de test n'est dépourvu de `titre`. En
// forçant la réponse de la requête que lit `needsOnboarding` (App.tsx), on
// reproduit exactement la configuration fautive sans dépendre d'un compte
// mal configuré qu'il faudrait entretenir — et sans second jeu d'identifiants.
test.describe('Helper loginPraticien — compte sans titre', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('un compte sans titre fait échouer la connexion, avec un message qui nomme la cause', async ({ page }) => {
    // `needsOnboarding` lit `praticiens.titre` : on répond « titre absent ».
    // `.single()` demande un objet, pas un tableau.
    await page.route(
      url => /\/rest\/v1\/praticiens\b/.test(url.href) && /select=titre/.test(url.href),
      route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ titre: null }),
      })
    );

    const erreur = await loginPraticien(page).then(
      () => null,
      (e: Error) => e
    );

    // Le helper doit lever — et dire pourquoi.
    expect(erreur, "loginPraticien a validé une connexion partie en onboarding").not.toBeNull();
    expect(erreur!.message).toMatch(/onboarding/i);
    expect(erreur!.message).toMatch(/titre/i);

    // Et l'application est bien partie sur l'onboarding : c'est la situation
    // que le helper doit détecter, pas une erreur d'une autre nature.
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
