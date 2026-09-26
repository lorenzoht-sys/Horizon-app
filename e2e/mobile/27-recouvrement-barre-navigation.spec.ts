import { test, expect, type Page } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';

// Chantier « barre de navigation mobile qui recouvre le bas des pages
// fusionnées ». Constaté pendant le chantier Contrats (#92) : au défilement
// maximal, BarreNavigationMobile (fixe, 70px) recouvrait le bas du contenu
// sur plusieurs écrans fusionnés (estRouteInterfaceUnique,
// src/lib/routesMobile.ts) — mesuré à 26-39px sur la fiche et /archives.
//
// ── Root cause, pas un défaut de padding ────────────────────────────────
// Le conteneur partagé (App.tsx, DesktopContent) réserve déjà
// `pb-[calc(76px+env(safe-area-inset-bottom))]` sous 768px — plus que
// suffisant face aux 70px réels de la barre (mesuré via
// getBoundingClientRect()). Le vrai bug : PageTransition.tsx (qui enveloppe
// CHAQUE route) fixait `height: '100%'` sur son wrapper framer-motion. Un
// enfant en `height:100%` dans un parent `overflow-y:auto` fait ignorer le
// `padding-bottom` de ce parent dans son propre `scrollHeight` — vérifié par
// une reproduction minimale hors React (voir le rapport du chantier).
// Résultat : le padding-bottom du conteneur partagé était SANS EFFET sur les
// pages dont le contenu réel s'approchait du bord bas (peu importe sa
// valeur — vérifié jusqu'à 500px sans changement). `min-height: '100%'`
// corrige le calcul sans rien changer au comportement « remplit la hauteur
// disponible » dont s'servent certaines pages (h-full).
//
// Ce test couvre 2 écrans fusionnés qui ne nécessitent aucune donnée
// particulière (aucun bilan, aucun participant archivé) : la fiche
// elle-même (où le recouvrement était mesuré, via le Radar fonctionnel /
// graphique d'évolution des ressentis) et /contrat/nouveau — l'écran où le
// recouvrement avait été corrigé ponctuellement (pb-24, retiré : ce test
// est la seule protection contre une régression maintenant que le correctif
// vit uniquement dans PageTransition.tsx).

async function mesurerRecouvrement(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigation principale"]');
    if (!nav) throw new Error('BarreNavigationMobile introuvable — route pas fusionnée ?');
    const scrollDiv = nav.parentElement?.previousElementSibling as HTMLElement | null;
    if (!scrollDiv) throw new Error('Conteneur défilant introuvable');
    scrollDiv.scrollTop = scrollDiv.scrollHeight;
    const navTop = nav.getBoundingClientRect().top;
    // Feuilles uniquement (aucun enfant élément) : un wrapper (MAIN,
    // section…) peut s'étirer à height:100%/min-height et son rect.bottom
    // ne dit rien de la position du contenu réel.
    let maxBottom = 0;
    for (const el of scrollDiv.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > maxBottom) maxBottom = r.bottom;
    }
    return Math.max(0, maxBottom - navTop);
  });
}

test.describe('Barre de navigation mobile : aucun recouvrement du contenu (écrans fusionnés)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('la fiche ne passe pas sous la barre au défilement maximal à 390px', async ({ page }) => {
    const nomComplet = `${env.patientPrenom2} ${env.patientNom2}`;
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginPraticien(page);
    await page.goto('/');
    await page.getByRole('heading', { name: nomComplet }).click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
    const participantUrl = page.url();
    await page.waitForLoadState('networkidle');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(participantUrl);
    await page.waitForLoadState('networkidle');

    const recouvrement = await mesurerRecouvrement(page);
    expect(recouvrement, 'la fiche ne doit pas passer sous la barre du bas au défilement maximal').toBeLessThanOrEqual(1);
  });

  test('/contrat/nouveau ne passe pas sous la barre au défilement maximal à 390px', async ({ page }) => {
    const nomComplet = `${env.patientPrenom2} ${env.patientNom2}`;
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginPraticien(page);
    await page.goto('/');
    await page.getByRole('heading', { name: nomComplet }).click();
    await page.waitForURL(/\/participant\/[0-9a-fA-F-]+$/);
    const participantUrl = page.url();
    await page.waitForLoadState('networkidle');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${participantUrl}/contrat/nouveau`);
    await page.waitForLoadState('networkidle');

    const recouvrement = await mesurerRecouvrement(page);
    expect(recouvrement, '/contrat/nouveau ne doit pas passer sous la barre du bas au défilement maximal').toBeLessThanOrEqual(1);
  });
});
