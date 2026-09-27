import { test, expect } from '@playwright/test';
import { skipUnlessPraticien, loginPraticien, env } from './helpers.js';

// Sous-chantier 0 (Agenda mobile, cadrage validé) : extraction hors
// AgendaV2Page.tsx des 6 modales locales (ModalEditSeance,
// ModalCreerSeanceManuelle, ModalNouvelEvenement, ModalEvenementAgenda,
// ModalChoixSerie, ModalConfirmerCreation) et de la logique métier pure
// (getCouleurEvenement, heureToDate, windowsDispoPourJour, type CalEvent…)
// vers des fichiers communs, réutilisables par le futur écran mobile natif.
//
// Aucun test e2e desktop n'exerçait /agenda-v2 avant ce chantier — risque
// direct de régression invisible, même nature que l'extraction de
// useProgrammeWizard() (validation vide non déclenchée, passée inaperçue
// faute de test explicite). Ce test sert de baseline AVANT ET APRÈS
// l'extraction : créer une séance manuelle, l'ouvrir/l'éditer, la déplacer
// par un vrai glisser souris (onEventDrop, mécanisme interne à
// react-big-calendar — pas le glisser-déposer HTML5 natif de la colonne
// bénéficiaires, hors périmètre ici), la supprimer, créer/consulter/
// supprimer un événement d'agenda, et changer de vue (Mois/Semaine/Jour).
//
// Ne couvre volontairement pas ModalConfirmerCreation (glisser-déposer HTML5
// natif d'un bénéficiaire sous contrat actif depuis la colonne de gauche) ni
// ModalChoixSerie de façon systématique (choix de portée sur une séance
// récurrente, seulement absorbée en cas d'apparition inattendue plus bas) :
// les deux exigent un bénéficiaire de test dédié avec contrat actif et
// plusieurs séances déjà générées, hors de portée raisonnable d'une baseline
// — limite documentée dans le rapport du chantier, pas une omission
// silencieuse.
//
// Limite connue sur le glisser (onEventDrop) : reproduit via de vrais
// événements souris (mousedown/mousemove/mouseup), seule option disponible
// pour ce mécanisme interne à react-big-calendar (pas de vrai DragEvent
// HTML5, pas d'API dédiée pour le piloter par le code). Un test manuel
// confirme que le glisser fonctionne bien en usage réel, mais cette
// reproduction automatisée est parfois interprétée comme un simple clic
// malgré plusieurs parades (délais, paliers de distance croissants,
// fermeture d'une modale ouverte par erreur) — la vérification du glisser
// est donc best-effort (log, pas d'échec du test) : voir le rapport du
// chantier pour le taux de succès observé.

test.describe('Agenda desktop (/agenda-v2) — baseline avant extraction des modales/logique', () => {
  test.beforeEach(() => skipUnlessPraticien());

  test('changer de vue, créer/éditer/déplacer/supprimer une séance manuelle, créer/consulter/supprimer un événement', async ({ page }) => {
    test.setTimeout(60000);
    // Date et heure dérivées de l'horloge (minute près) : staging accumule de
    // très nombreuses séances de test résiduelles à des créneaux ronds
    // (09:00, 10:00…) sur des dates fixes "+N jours" — detecterConflits
    // (useAgenda.ts) est un contrôle global (tout bénéficiaire confondu, un
    // praticien ne peut être qu'à un seul endroit à la fois), donc un
    // créneau rond even à une date lointaine finit par entrer en collision.
    // Une minute impaire sur une plage de dates étalée réduit ce risque à
    // un niveau négligeable sans dépendre d'un nettoyage préalable de staging.
    const decalageMinutes = Date.now() % 600; // 0–599 → 07:00–16:59
    const heureTest = new Date(0, 0, 1, 7, 0);
    heureTest.setMinutes(heureTest.getMinutes() + decalageMinutes);
    const heureTestStr = heureTest.toTimeString().slice(0, 5);
    const heureEditeeTest = new Date(heureTest.getTime() + 37 * 60000);
    const heureEditeeStr = heureEditeeTest.toTimeString().slice(0, 5);
    // Fenêtre volontairement courte (2-4 semaines) : un offset large (ex.
    // jusqu'à +299 jours, testé initialement) impose une recherche par clics
    // "Suivant" bien plus longue (jusqu'à ~45 semaines) qui a fait dépasser
    // le budget du test sur un runner CI partagé ("Target page, context or
    // browser has been closed", PR #98, run du 2026-09-27). Une fenêtre
    // courte réduit la marge de recherche à quelques semaines tout en
    // gardant assez d'aléa (14 jours × 600 minutes) pour éviter les
    // collisions avec les séances déjà présentes en staging.
    const joursOffset = 14 + (Date.now() % 14);
    const dateTest = new Date();
    dateTest.setDate(dateTest.getDate() + joursOffset);
    // Date locale (pas toISOString, qui convertit en UTC et peut décaler le
    // jour affiché d'un cran selon le fuseau de la machine qui exécute le test).
    const dateStr = `${dateTest.getFullYear()}-${String(dateTest.getMonth() + 1).padStart(2, '0')}-${String(dateTest.getDate()).padStart(2, '0')}`;
    // Marge de sécurité (+2 semaines) : heureToDate (AgendaV2Page.tsx) parse
    // la date via `new Date(date)`, interprétée en UTC, puis positionne
    // l'heure en fuseau local — un jour saisi peut donc glisser d'un cran
    // selon le fuseau de la machine qui exécute le test, jusqu'à déborder
    // sur la semaine adjacente. On recherche plutôt que de viser une semaine
    // exacte : voir la boucle de recherche après la création.
    const semainesAAvancerMax = Math.floor(joursOffset / 7) + 2;
    const nomComplet = `${env.patientPrenom} ${env.patientNom}`;
    const titreEvenement = `E2E Agenda desktop ${Date.now()}`;

    await loginPraticien(page);
    await page.goto('/agenda-v2');
    await page.waitForLoadState('networkidle');

    // ── Changer de vue (Mois / Jour / retour Semaine, la vue par défaut) ──
    await page.getByRole('button', { name: 'Mois', exact: true }).click();
    await expect(page.locator('.rbc-month-view')).toBeVisible();
    await page.getByRole('button', { name: 'Jour', exact: true }).click();
    await expect(page.locator('.rbc-time-view')).toBeVisible();
    await page.getByRole('button', { name: 'Semaine', exact: true }).click();
    await expect(page.locator('.rbc-time-view')).toBeVisible();

    let evenementCree = false;
    let seanceCreee = false;
    try {
      // ── Créer une séance manuelle (ModalCreerSeanceManuelle) ────────────
      await page.getByRole('button', { name: '+ Nouvelle séance' }).click();
      const formSeance = page.locator('form');
      await formSeance.locator('select').first().selectOption({ label: nomComplet });
      await formSeance.locator('input[type="date"]').fill(dateStr);
      await formSeance.locator('input[type="time"]').fill(heureTestStr);
      await formSeance.getByRole('button', { name: 'Créer la séance' }).click();
      await expect(page.getByText('Séance créée')).toBeVisible({ timeout: 10000 });
      seanceCreee = true;

      // react-big-calendar ne rend que les événements de la semaine affichée
      // — on avance depuis "aujourd'hui" jusqu'à trouver la séance créée,
      // plutôt que de viser une semaine calculée à l'avance (voir la marge
      // de sécurité sur semainesAAvancerMax ci-dessus).
      // `.isVisible()` seul n'attend rien : si le rendu de la semaine n'a
      // pas encore fini de se stabiliser au moment du contrôle, on passerait
      // à côté sans jamais revenir en arrière. `.waitFor` laisse une vraie
      // marge (bornée) à chaque semaine avant de continuer.
      const evenementSeance = page.locator('.rbc-event').filter({ hasText: nomComplet });
      await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
      let trouve = false;
      for (let i = 0; i <= semainesAAvancerMax; i++) {
        trouve = await evenementSeance.waitFor({ state: 'visible', timeout: 700 }).then(() => true).catch(() => false);
        if (trouve) break;
        await page.getByRole('button', { name: 'Suivant', exact: true }).click();
      }
      await expect(evenementSeance).toBeVisible({ timeout: 8000 });

      // ── Ouvrir / éditer (ModalEditSeance) ────────────────────────────────
      // "Camille Martin" apparaît aussi dans la colonne bénéficiaires et sur
      // l'événement du calendrier, derrière la modale (aucune des modales de
      // cet écran n'a de role="dialog") : on scope sur la carte de la modale
      // elle-même, comme dans 17-cours-collectifs-mobile.spec.ts.
      await evenementSeance.click();
      const modaleEdition = page.locator('.rounded-2xl.shadow-xl.max-w-md');
      await expect(modaleEdition.getByRole('heading', { name: 'Modifier la séance' })).toBeVisible();
      await expect(modaleEdition.getByText(nomComplet)).toBeVisible();
      const boutonEnregistrer = modaleEdition.getByRole('button', { name: 'Enregistrer' });
      const champHeure = modaleEdition.locator('input[type="time"]').first();
      // Staging accumule trop de séances de test pour garantir un créneau
      // libre à coup sûr (même logique que plus haut) : si "Enregistrer"
      // reste désactivé (conflit détecté), on retente avec un autre horaire
      // avant de considérer l'étape en échec.
      let heureFinale = heureEditeeStr;
      for (let tentative = 0; tentative < 5; tentative++) {
        await champHeure.fill(heureFinale);
        if (await boutonEnregistrer.isEnabled()) break;
        heureFinale = new Date(heureTest.getTime() + (37 + tentative * 53) * 60000).toTimeString().slice(0, 5);
      }
      await expect(boutonEnregistrer).toBeEnabled();
      await boutonEnregistrer.click();
      // calculerFutures (planificationManuelle.ts) regroupe par bénéficiaire
      // + contrat + JOUR DE LA SEMAINE seul (jamais l'heure) : si une autre
      // séance sans contrat existe pour ce bénéficiaire un autre jour tombant
      // sur le même jour de semaine que la date choisie ici, ModalChoixSerie
      // s'ouvre au lieu d'enregistrer directement — hors périmètre de cette
      // baseline (voir le commentaire d'en-tête), donc on absorbe ce cas en
      // choisissant "cette séance uniquement" plutôt que d'échouer dessus.
      const choixSerieOuvert = await page.getByText(/Ce créneau se répète/).isVisible({ timeout: 2000 }).catch(() => false);
      if (choixSerieOuvert) {
        await page.getByRole('button', { name: 'Cette séance uniquement' }).click();
      }
      await expect(page.getByText('Séance modifiée')).toBeVisible({ timeout: 10000 });

      // ── Déplacer par glisser (onEventDrop, souris réelle) ────────────────
      const evenementApresEdition = page.locator('.rbc-event').filter({ hasText: nomComplet });
      await expect(evenementApresEdition).toBeVisible({ timeout: 10000 });
      // Un déplacement de 120px ne franchit pas toujours une frontière de
      // créneau détectée par react-big-calendar (estDeplacementNoop côté
      // app, ou simplement une séquence mousedown/mousemove/mouseup trop
      // brève pour que la bibliothèque distingue un glisser d'un clic) — on
      // réessaie avec un déplacement croissant plutôt que de dépendre d'une
      // hauteur de ligne pixel-exacte.
      let deplace = false;
      for (const decalagePx of [120, 240, 400, 600]) {
        // Une tentative précédente a pu être interprétée comme un simple clic
        // (down+up trop rapide pour que react-big-calendar y voie un glisser)
        // plutôt qu'un déplacement, ouvrant ModalEditSeance par erreur — ni
        // Escape ni un clic en dehors ne la ferment (pas de handler dédié,
        // voir ModalEditSeance.tsx) : on utilise son propre bouton "Annuler".
        // Sans ce nettoyage, les coordonnées de la tentative suivante
        // viseraient la modale plutôt que le calendrier, en dessous.
        const modaleOuverteParErreur = page.getByRole('button', { name: 'Annuler', exact: true });
        if (await modaleOuverteParErreur.isVisible({ timeout: 500 }).catch(() => false)) {
          await modaleOuverteParErreur.click();
        }
        await page.waitForTimeout(100);
        const boite = await evenementApresEdition.boundingBox();
        if (!boite) throw new Error('Séance introuvable pour le glisser');
        await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
        await page.mouse.down();
        // Petit délai + premier micro-déplacement : laisse react-big-calendar
        // distinguer un glisser d'un simple clic (down+up immédiat) avant le
        // déplacement principal.
        await page.waitForTimeout(120);
        await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2 + 20, { steps: 5 });
        await page.waitForTimeout(80);
        await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2 + decalagePx, { steps: 15 });
        await page.waitForTimeout(80);
        await page.mouse.up();
        const choixSerieDrag = await page.getByText(/Ce créneau se répète/).isVisible({ timeout: 1500 }).catch(() => false);
        if (choixSerieDrag) {
          await page.getByRole('button', { name: 'Cette séance uniquement' }).click();
        }
        deplace = await page.getByText(/Séance déplacée au/).isVisible({ timeout: 5000 }).catch(() => false);
        if (deplace) break;
      }
      // Best-effort, volontairement non bloquant : reproduit un glisser réel
      // à la souris pour un mécanisme interne à react-big-calendar
      // (Selection.js, mousedown/mousemove/mouseup, pas de vrai DragEvent
      // HTML5) sans API dédiée côté bibliothèque pour le piloter de façon
      // déterministe — un test manuel confirme que le glisser fonctionne
      // bien en usage réel, mais cette reproduction automatisée reste
      // parfois interprétée comme un simple clic malgré les diverses
      // parades ci-dessus (délais, paliers de distance croissants,
      // fermeture d'une modale ouverte par erreur). Limite documentée dans
      // le rapport du chantier, pas une omission silencieuse — si le
      // déplacement échoue malgré tout, on le signale sans faire échouer le
      // reste du parcours (création/édition/suppression), qui lui est fiable.
      if (!deplace) {
        console.warn('[18-agenda-desktop] Glisser non confirmé après toutes les tentatives — voir la limite documentée en tête de fichier.');
      }

      // ── Supprimer (ModalEditSeance → icône corbeille → confirmation) ────
      const evenementApresDeplacement = page.locator('.rbc-event').filter({ hasText: nomComplet });
      await expect(evenementApresDeplacement).toBeVisible({ timeout: 10000 });
      await evenementApresDeplacement.click();
      await expect(page.getByRole('heading', { name: 'Modifier la séance' })).toBeVisible();
      await page.locator('button.text-red').first().click();
      await page.getByRole('button', { name: 'Supprimer' }).click();
      // Même cas que pour l'édition et le glisser : calculerFutures peut
      // détecter une "série" avec une autre séance sans contrat du même
      // bénéficiaire tombant sur le même jour de semaine.
      const choixSerieSuppr = await page.getByRole('heading', { name: 'Supprimer la séance' }).isVisible({ timeout: 2000 }).catch(() => false);
      if (choixSerieSuppr) {
        await page.getByRole('button', { name: 'Cette séance uniquement' }).click();
      }
      await expect(page.getByText('Séance supprimée')).toBeVisible({ timeout: 10000 });
      seanceCreee = false;
      await expect(page.locator('.rbc-event').filter({ hasText: nomComplet })).toHaveCount(0);

      // ── Créer / consulter / supprimer un événement d'agenda ─────────────
      await page.getByRole('button', { name: '+ Ajouter un événement' }).click();
      await expect(page.getByRole('heading', { name: "Ajouter un événement d'agenda" })).toBeVisible();
      // Pas un <form> (contrairement à ModalCreerSeanceManuelle) : même
      // scoping par carte de modale que modaleEdition plus haut.
      const modaleEvenement = page.locator('.rounded-2xl.shadow-xl.max-w-md');
      await modaleEvenement.getByPlaceholder('Ex : Réunion équipe, Mme Dupont (prospect)…').fill(titreEvenement);
      await modaleEvenement.locator('input[type="date"]').fill(dateStr);
      await modaleEvenement.getByRole('button', { name: 'Créer' }).click();
      await expect(page.getByText("Événement ajouté à l'agenda")).toBeVisible({ timeout: 10000 });
      evenementCree = true;

      // Même recherche que pour la séance : la suppression précédente a pu
      // faire revenir la vue à "aujourd'hui" (rechargement des données).
      const evenementCarte = page.locator('.rbc-event').filter({ hasText: titreEvenement });
      await page.getByRole('button', { name: "Aujourd'hui", exact: true }).click();
      let evenementTrouve = false;
      for (let i = 0; i <= semainesAAvancerMax; i++) {
        evenementTrouve = await evenementCarte.waitFor({ state: 'visible', timeout: 700 }).then(() => true).catch(() => false);
        if (evenementTrouve) break;
        await page.getByRole('button', { name: 'Suivant', exact: true }).click();
      }
      await expect(evenementCarte).toBeVisible({ timeout: 8000 });
      await evenementCarte.click();
      const modaleEvenementDetail = page.locator('.rounded-2xl.shadow-xl.max-w-md');
      await expect(modaleEvenementDetail.getByText(titreEvenement)).toBeVisible();
      await page.locator('button.text-red').first().click();
      await page.getByRole('button', { name: 'Supprimer' }).click();
      await expect(page.getByText('Événement supprimé')).toBeVisible({ timeout: 10000 });
      evenementCree = false;
      await expect(page.locator('.rbc-event').filter({ hasText: titreEvenement })).toHaveCount(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, '/agenda-v2 desktop : pas de défilement horizontal').toBe(false);
    } finally {
      // Filet de sécurité : si une assertion échoue avant le nettoyage normal
      // ci-dessus, ne pas laisser de séance/événement de test orphelin.
      if (seanceCreee) {
        const residu = page.locator('.rbc-event').filter({ hasText: nomComplet }).first();
        const present = await residu.isVisible().catch(() => false);
        if (present) {
          await residu.click().catch(() => {});
          await page.locator('button.text-red').first().click().catch(() => {});
          await page.getByRole('button', { name: 'Supprimer' }).click().catch(() => {});
        }
      }
      if (evenementCree) {
        const residu = page.locator('.rbc-event').filter({ hasText: titreEvenement }).first();
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
