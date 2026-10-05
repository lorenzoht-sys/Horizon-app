import { test, expect, type Page, type Locator } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Sous-chantier 1 (Agenda mobile, cadrage validé) : écran natif EcranAgenda
// (AppMobile.tsx), vue Jour uniquement (MVP) — pas de fusion de route,
// react-big-calendar n'est pas utilisé côté mobile. Point d'entrée :
// remplace le renvoi vers /agenda-v2 (desktop-only) depuis l'écran « Plus »
// → « Mon activité » → « Agenda complet », qui pointe désormais vers /agenda.
//
// Réutilise telles quelles les modales extraites au sous-chantier 0
// (ModalCreerSeanceManuelle, ModalEditSeance, ModalChoixSerie,
// ModalPresenceCoursCollectif, ModalEvenementAgenda) — ce test vérifie que
// leur usage mobile fonctionne, pas leur logique interne (déjà couverte par
// 18-agenda-desktop.spec.ts et les tests unitaires de planificationManuelle).

test.describe('Agenda mobile (écran natif, vue Jour — MVP)', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('ouvrir depuis « Plus », changer de jour, créer une séance, l\'éditer, vérifier son affichage', async ({ page }) => {
    test.setTimeout(45000);
    // Heure impaire pour limiter le risque de collision avec des séances déjà
    // présentes en staging (même logique que 18-agenda-desktop.spec.ts).
    const decalageMinutes = Date.now() % 600;
    const heureTest = new Date(0, 0, 1, 7, 0);
    heureTest.setMinutes(heureTest.getMinutes() + decalageMinutes);
    const heureTestStr = heureTest.toTimeString().slice(0, 5);
    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    // Renseignées une fois l'heure de création effective connue (peut
    // différer de heureTestStr après les tentatives ci-dessous) — utilisées
    // aussi par le filet de sécurité (finally).
    let heureCreation = heureTestStr;
    let heureEditee = '';

    await loginPraticien(page);

    // ── Ouvrir l'agenda depuis « Plus » → « Agenda complet » ────────────────
    await page.goto('/');
    await page.getByRole('button', { name: 'Plus', exact: true }).click();
    await page.getByText('Agenda complet').click();
    await expect(page.getByText('Agenda', { exact: true })).toBeVisible();

    // ── Changer de jour (flèches) ────────────────────────────────────────────
    const labelJour = page.locator('div').filter({ hasText: /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/ }).first();
    const jourInitial = await labelJour.textContent();
    await page.getByRole('button', { name: 'Jour suivant' }).click();
    await expect(labelJour).not.toHaveText(jourInitial ?? '');
    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await expect(labelJour).toHaveText(jourInitial ?? '');

    let seanceCreee = false;
    try {
      // ── Créer une séance manuelle (ModalCreerSeanceManuelle) ──────────────
      // Staging accumule énormément de séances de test pour Camille Martin à
      // la date du jour (défaut de la plupart des specs e2e) : le bouton
      // "Créer la séance" reste désactivé en cas de conflit — on retente
      // avec un autre horaire plutôt que de garantir un créneau libre à coup
      // sûr (même logique que 18-agenda-desktop.spec.ts).
      await page.getByRole('button', { name: '+ Nouvelle séance' }).click();
      const formSeance = page.locator('form');
      await formSeance.locator('select').first().selectOption({ label: nomComplet });
      const boutonCreer = formSeance.getByRole('button', { name: 'Créer la séance' });
      const champHeureCreation = formSeance.locator('input[type="time"]');
      for (let tentative = 0; tentative < 6; tentative++) {
        await champHeureCreation.fill(heureCreation);
        if (await boutonCreer.isEnabled()) break;
        heureCreation = new Date(heureTest.getTime() + (tentative + 1) * 83 * 60000).toTimeString().slice(0, 5);
      }
      await expect(boutonCreer).toBeEnabled();
      await boutonCreer.click();
      await expect(page.getByText('Séance créée')).toBeVisible({ timeout: 10000 });
      seanceCreee = true;
      heureEditee = new Date(heureTest.getTime() + 611 * 60000).toTimeString().slice(0, 5);

      // Staging accumule de très nombreuses séances de test pour Camille
      // Martin à la date du jour (plusieurs autres specs e2e y créent des
      // séances par défaut) : on scope sur l'heure exacte, unique, pour
      // désambiguïser (même logique que 18-agenda-desktop.spec.ts).
      const carteSeance = page.getByRole('button', { name: new RegExp(nomComplet) }).filter({ hasText: heureCreation });
      await expect(carteSeance).toBeVisible({ timeout: 10000 });

      // ── Éditer (ModalEditSeance) — changer l'heure, pas de glisser ────────
      await carteSeance.click();
      const modaleEdition = page.locator('.rounded-2xl.shadow-xl.max-w-md');
      await expect(modaleEdition.getByRole('heading', { name: 'Modifier la séance' })).toBeVisible();
      await expect(modaleEdition.getByText(nomComplet)).toBeVisible();

      // ── Recouvrement bas de page : mesure, pas supposition ────────────────
      // Même patron que les chantiers précédents (Bibliothèque, Structures,
      // cours collectifs) : document.elementFromPoint plutôt qu'un simple
      // clic, qui peut réussir même à la frontière visuelle exacte.
      const boutonEnregistrer = modaleEdition.getByRole('button', { name: 'Enregistrer' });
      await boutonEnregistrer.scrollIntoViewIfNeeded();
      const boite = await boutonEnregistrer.boundingBox();
      const recouvertParNav = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const nav = document.querySelector('nav[aria-label="Navigation principale"]');
        return !!nav && (el === nav || nav.contains(el));
      }, { x: boite!.x + boite!.width / 2, y: boite!.y + boite!.height - 2 });
      expect(recouvertParNav, 'le bouton "Enregistrer" ne doit pas être recouvert par la barre de navigation').toBe(false);

      // Même parade qu'à la création : "Enregistrer" reste désactivé en cas
      // de conflit détecté sur le nouvel horaire.
      const champHeureEdition = modaleEdition.locator('input[type="time"]').first();
      for (let tentative = 0; tentative < 5; tentative++) {
        await champHeureEdition.fill(heureEditee);
        if (await boutonEnregistrer.isEnabled()) break;
        heureEditee = new Date(heureTest.getTime() + (611 + tentative * 59) * 60000).toTimeString().slice(0, 5);
      }
      await expect(boutonEnregistrer).toBeEnabled();
      await boutonEnregistrer.click();
      const choixSerieOuvert = await page.getByText(/Ce créneau se répète/).isVisible({ timeout: 2000 }).catch(() => false);
      if (choixSerieOuvert) {
        await page.getByRole('button', { name: 'Cette séance uniquement' }).click();
      }
      await expect(page.getByText('Séance modifiée')).toBeVisible({ timeout: 10000 });

      const carteApresEdition = page.getByRole('button', { name: new RegExp(nomComplet) }).filter({ hasText: heureEditee });
      await expect(carteApresEdition).toBeVisible({ timeout: 10000 });

      // ── Supprimer (nettoyage via la fonctionnalité réelle) ────────────────
      await carteApresEdition.click();
      await expect(page.getByRole('heading', { name: 'Modifier la séance' })).toBeVisible();
      await page.locator('button.text-red').first().click();
      await page.getByRole('button', { name: 'Supprimer' }).click();
      const choixSerieSuppr = await page.getByRole('heading', { name: 'Supprimer la séance' }).isVisible({ timeout: 2000 }).catch(() => false);
      if (choixSerieSuppr) {
        await page.getByRole('button', { name: 'Cette séance uniquement' }).click();
      }
      await expect(page.getByText('Séance supprimée')).toBeVisible({ timeout: 10000 });
      seanceCreee = false;
      await expect(page.getByRole('button', { name: new RegExp(nomComplet) }).filter({ hasText: heureEditee })).toHaveCount(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'Agenda mobile : pas de défilement horizontal à 390px').toBe(false);
    } finally {
      // La séance peut être à heureCreation (échec avant édition) ou à
      // heureEditee (échec après) — filtre par l'une ou l'autre plutôt que
      // par le seul nom, sans quoi les nombreuses autres séances de test
      // préexistantes pour ce bénéficiaire, à la date du jour, seraient
      // candidates au nettoyage.
      if (seanceCreee) {
        const residu = page.getByRole('button', { name: new RegExp(nomComplet) })
          .filter({ hasText: new RegExp(`${heureCreation}|${heureEditee || '\\b\\B'}`) })
          .first();
        const present = await residu.isVisible().catch(() => false);
        if (present) {
          await residu.click().catch(() => {});
          await page.locator('button.text-red').first().click().catch(() => {});
          await page.getByRole('button', { name: 'Supprimer' }).click().catch(() => {});
        }
      }
    }
  });
});

// Sous-chantier 3 (Vue Mois mobile) : grille mensuelle dans EcranAgenda,
// bascule Jour/Mois, compteur de charge par case (séances + cours collectifs
// + événements, hors annulés), tap sur une case → vue Jour. Aucune nouvelle
// requête réseau : useAgenda / useCoursCollectifs / useEvenementsAgenda
// chargent déjà l'intégralité des données, sans filtre de date.
// 2026-10-05 — ligne de base fiable du compteur. Le badge « charge-jour » n'existe que si le compte
// est > 0 : « pas de badge » et « données pas encore chargées » sont indiscernables, et séances,
// cours collectifs et événements arrivent par trois requêtes indépendantes. Une lecture isolée
// juste après l'affichage du mois lisait 0 alors que 2 séances résiduelles allaient apparaître :
// l'attendu devenait 1 (0 + 1) pour 3 reçues. On attend le réseau, puis trois lectures identiques
// consécutives ; si le compteur reste instable, le test échoue au lieu de deviner.
async function lireCompteStable(page: Page, badge: Locator): Promise<number> {
  await page.waitForLoadState('networkidle');
  const limite = Date.now() + 10000;
  let derniere = -1;
  let identiques = 0;
  while (Date.now() < limite) {
    const valeur = (await badge.count()) > 0 ? Number(await badge.first().textContent()) : 0;
    identiques = valeur === derniere ? identiques + 1 : 1;
    derniere = valeur;
    if (identiques >= 3) return valeur;
    await page.waitForTimeout(400);
  }
  throw new Error('Compteur de la case instable pendant 10 s (dernière lecture : ' + derniere + ')');
}

test.describe('Agenda mobile — vue Mois', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('bascule en vue Mois, vérifie le compteur d\'une case, tape dessus pour revenir en vue Jour', async ({ page }) => {
    test.setTimeout(45000);
    const decalageMinutes = Date.now() % 600;
    const heureTest = new Date(0, 0, 1, 8, 0);
    heureTest.setMinutes(heureTest.getMinutes() + decalageMinutes);
    let heureCreation = heureTest.toTimeString().slice(0, 5);
    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    const marqueur = `E2E mobile agenda mois ${Date.now()}`;

    // Date cible : décalée de 45 jours par rapport à aujourd'hui, hors de la fenêtre des autres
    // specs qui créent des données datées dans cet agenda : 18-agenda-desktop (+14 à +27 jours,
    // aléatoire) et mobile/34 (+23). Elles tournent EN PARALLÈLE de ce test (fullyParallel) et
    // en modifiaient le compteur entre la lecture de la base de référence et la vérification.
    // Les autres specs n'utilisent que +1 et +3 jours (voir aussi le test précédent).
    const aujourdHui = new Date();
    const dateCible = new Date(aujourdHui);
    dateCible.setDate(dateCible.getDate() + 45);
    const dateCibleStr = `${dateCible.getFullYear()}-${String(dateCible.getMonth() + 1).padStart(2, '0')}-${String(dateCible.getDate()).padStart(2, '0')}`;
    // Doit être identique au calcul de l'aria-label posé sur chaque case du
    // mois (formatDateAgenda / lib/agendaCommun.ts), pour cibler la bonne case.
    const libelleCase = new Date(dateCibleStr + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    const moisADepasser = (dateCible.getFullYear() * 12 + dateCible.getMonth()) - (aujourdHui.getFullYear() * 12 + aujourdHui.getMonth());

    await loginPraticien(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Plus', exact: true }).click();
    await page.getByText('Agenda complet').click();
    await expect(page.getByText('Agenda', { exact: true })).toBeVisible();

    let seanceCreee = false;
    let seanceId: string | null = null;
    try {
      // ── Vue Mois, navigation jusqu'au mois cible ────────────────────────
      await page.getByRole('button', { name: 'Mois', exact: true }).click();
      for (let i = 0; i < moisADepasser; i++) {
        await page.getByRole('button', { name: 'Mois suivant' }).click();
      }
      const caseCible = page.getByRole('button', { name: libelleCase });
      await expect(caseCible).toBeVisible();
      const badgeCible = caseCible.getByTestId('charge-jour');
      const avant = await lireCompteStable(page, badgeCible);

      // ── Créer une séance de test à la date cible (le formulaire reste
      // accessible depuis la vue Mois — même bouton d'en-tête) ────────────
      await page.getByRole('button', { name: '+ Nouvelle séance' }).click();
      const formSeance = page.locator('form');
      await formSeance.locator('select').first().selectOption({ label: nomComplet });
      await formSeance.locator('input[type="date"]').fill(dateCibleStr);
      await formSeance.locator('textarea').fill(marqueur);
      const boutonCreer = formSeance.getByRole('button', { name: 'Créer la séance' });
      const champHeureCreation = formSeance.locator('input[type="time"]');
      for (let tentative = 0; tentative < 6; tentative++) {
        await champHeureCreation.fill(heureCreation);
        if (await boutonCreer.isEnabled()) break;
        heureCreation = new Date(heureTest.getTime() + (tentative + 1) * 83 * 60000).toTimeString().slice(0, 5);
      }
      await expect(boutonCreer).toBeEnabled();
      await boutonCreer.click();
      await expect(page.getByText('Séance créée')).toBeVisible({ timeout: 10000 });
      seanceCreee = true;

      // ── Lecture directe en base : identifie LA séance créée par ce run,
      // par son marqueur unique + sa date (script séparé de la suppression,
      // ciblage par identifiant ensuite) ───────────────────────────────────
      const adminLecture = clientAdminTest();
      if (adminLecture) {
        const { data } = await adminLecture.from('seances').select('id').eq('date', dateCibleStr).eq('notes', marqueur).limit(1);
        seanceId = data?.[0]?.id ?? null;
      }

      // ── Compteur mis à jour sur la case ──────────────────────────────────
      await expect(badgeCible).toHaveText(String(avant + 1));

      // ── Tap sur la case → vue Jour sur cette date ───────────────────────
      await caseCible.click();
      const carteSeance = page.getByRole('button', { name: new RegExp(nomComplet) }).filter({ hasText: heureCreation });
      await expect(carteSeance).toBeVisible({ timeout: 10000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, 'Vue Mois : pas de défilement horizontal à 390px').toBe(false);
    } finally {
      // ── Suppression directe en base, ciblée par l'id lu ci-dessus ───────
      // Filet de sécurité par marqueur + date si la lecture a échoué —
      // jamais par « la plus récente » (bénéficiaire partagé entre tests).
      const adminSuppression = clientAdminTest();
      if (adminSuppression && seanceId) {
        await adminSuppression.from('seances').delete().eq('id', seanceId);
      } else if (adminSuppression && seanceCreee) {
        await adminSuppression.from('seances').delete().eq('date', dateCibleStr).eq('notes', marqueur);
      }
    }
  });
});
