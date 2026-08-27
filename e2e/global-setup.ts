// e2e/global-setup.ts
//
// Sonde de joignabilité, exécutée une fois avant toute la suite.
//
// Pourquoi ce fichier existe : le 2026-08-27, `e2e` était rouge sur `main`
// depuis plusieurs jours avec une douzaine de `locator.fill: Test timeout of
// 30000ms exceeded` et des `getByText` introuvables — douze symptômes qui
// ressemblaient à douze régressions distinctes. La cause était unique et
// située hors du code testé : la protection de déploiement Vercel
// (`ssoProtection: all_except_custom_domains`) renvoyait un 302 vers le SSO
// sur CHAQUE requête, y compris `/api/*`. Playwright n'a jamais atteint
// l'application, et a passé vingt minutes à attendre des éléments qui ne
// pouvaient pas exister.
//
// Cette sonde transforme ce cas en UN message explicite, avant le premier
// test. Une cible injoignable ne doit plus jamais se présenter comme une
// régression fonctionnelle.

import type { FullConfig } from '@playwright/test';

// Marqueurs d'une page d'authentification Vercel plutôt que de l'application.
const MARQUEURS_SSO = ['_vercel_sso_nonce', 'sso-api', 'Authentication Required'];

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const base = process.env.E2E_BASE_URL;

  // Sans cible, toute la suite est déjà ignorée (voir e2e/helpers.ts) :
  // rien à sonder, et surtout rien à faire échouer.
  if (!base) return;

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const headers: Record<string, string> = {};
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass;
    headers['x-vercel-set-bypass-cookie'] = 'true';
  }

  let reponse: Response;
  try {
    // `redirect: 'follow'` est indispensable, pas un détail : quand le bypass
    // est accepté, `x-vercel-set-bypass-cookie` fait répondre Vercel par un
    // 307 vers la même URL, le temps de poser le cookie. Une sonde qui ne
    // suit pas les redirections prend ce 307 pour une erreur et arrête la
    // suite alors que tout va bien (constaté le 2026-08-27).
    reponse = await fetch(base, { headers, redirect: 'follow' });
  } catch (err) {
    throw new Error(
      `[e2e] Cible injoignable : ${base}\n` +
        `${err instanceof Error ? err.message : String(err)}\n` +
        `Le déploiement existe-t-il encore ?`
    );
  }

  const corps = await reponse.text().catch(() => '');

  // Une cible protégée finit sur le domaine d'authentification de Vercel,
  // pas sur celui du déploiement. Les redirections internes à l'application
  // (ex. `/` vers `/login`) restent sur le même hôte et ne comptent pas.
  let horsDomaine = false;
  try {
    horsDomaine = new URL(reponse.url || base).host !== new URL(base).host;
  } catch {
    horsDomaine = false;
  }

  const protege =
    reponse.status === 401 ||
    horsDomaine ||
    MARQUEURS_SSO.some(m => corps.includes(m));

  if (protege) {
    throw new Error(
      [
        `[e2e] CIBLE PROTÉGÉE — les tests n'ont pas été lancés.`,
        ``,
        `  ${base}`,
        `  aboutit à l'authentification Vercel (HTTP ${reponse.status}${
          horsDomaine ? `, redirigé vers ${new URL(reponse.url).host}` : ''
        }).`,
        ``,
        bypass
          ? `VERCEL_AUTOMATION_BYPASS_SECRET est défini mais n'est pas accepté :`
            + ` la valeur ne correspond probablement plus au bypass configuré dans`
            + ` le projet Vercel (Settings > Deployment Protection > Protection`
            + ` Bypass for Automation).`
          : `VERCEL_AUTOMATION_BYPASS_SECRET n'est PAS défini. La protection de`
            + ` déploiement est active sur ce projet : sans ce secret, aucune`
            + ` requête automatisée ne peut atteindre l'application.`,
        ``,
        `Tant que ce point n'est pas réglé, TOUS les tests échoueraient pour`,
        `cette raison — et non pour une régression de l'application.`,
      ].join('\n')
    );
  }

  if (!reponse.ok) {
    throw new Error(
      `[e2e] Cible joignable mais en erreur : ${base} répond HTTP ${reponse.status}.\n` +
        `Déploiement en échec, ou URL qui ne correspond à aucun déploiement.`
    );
  }

  console.log(`[e2e] Cible joignable : ${base} (HTTP ${reponse.status})`);
}
