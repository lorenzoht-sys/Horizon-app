import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, format } from 'date-fns';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Chantier 15 (agenda mobile complet) : catégories colorées, objectif/notes, validation rapide,
// bilans automatiques, lien séance → bilan, accueil « Bilans à venir ».
//
// Aucune connexion patient (quota partagé 5/15 min/IP, voir CLAUDE.md). Fixtures écrites par le
// client admin sur un bénéficiaire dédié (jamais Camille/Julien), nettoyées par identifiant précis :
// séances du bénéficiaire de test, puis le bénéficiaire, puis les catégories créées par ce fichier.
// Chaque effet de l'interface est ensuite RELU EN BASE (pas seulement à l'écran), pour prouver que
// ce qu'on voit sur téléphone est bien ce qui sera retrouvé sur ordinateur.

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

const jour = (d: Date) => format(d, 'yyyy-MM-dd');
const dansJours = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

test.describe.serial('Agenda mobile — catégories, objectif, bilans automatiques', () => {
  test.describe.configure({ retries: 0 });

  let admin: SupabaseClient | null = null;
  let praticienId = '';
  let participantId = '';
  const categoriesACreer: string[] = [];
  let categorieBilanCreeeParLeTest: string | null = null;
  const marqueur = Date.now().toString(36);
  const nomComplet = `Test E2E${marqueur}`;
  const nomCategorie = `Cat${marqueur}`;

  test.beforeAll(async () => {
    if (!env.praticienEmail || !env.praticienPassword || !process.env.E2E_BASE_URL) return;
    admin = clientAdminTest();
    if (!admin) return;
    praticienId = await resoudrePraticienId(admin);
    const codeAcces = `E2E${marqueur}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const { data: participant, error } = await admin
      .from('participants')
      .insert({
        praticien_id: praticienId,
        prenom: 'Test',
        nom: `E2E${marqueur}`,
        code_acces: codeAcces,
        rgpd: { consentementObtenu: true, consentementDate: new Date().toISOString().slice(0, 10), methodeConsentement: 'numerique' },
      })
      .select('id')
      .single();
    if (error || !participant) throw new Error(`Création participant (fixture e2e) échouée : ${error?.message}`);
    participantId = participant.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    if (participantId) {
      await admin.from('seances').delete().eq('participant_id', participantId);
      await admin.from('bilans_auto').delete().eq('participant_id', participantId);
      await admin.from('participants').delete().eq('id', participantId);
    }
    for (const id of categoriesACreer) await admin.from('categories_seance').delete().eq('id', id);
    if (categorieBilanCreeeParLeTest) await admin.from('categories_seance').delete().eq('id', categorieBilanCreeeParLeTest);
  });

  test.beforeEach(() => {
    skipUnlessPraticien();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('créer une catégorie, la choisir pour une séance, la voir en couleur, valider, ajouter objectif et notes', async ({ page }) => {
    test.setTimeout(90000);
    const dateSeance = jour(dansJours(40));

    await loginPraticien(page);
    await page.goto(`/agenda?date=${dateSeance}`);

    // ── Créer la catégorie (couleur par défaut de la palette : violet #8B5CF6) ──
    await page.getByRole('button', { name: /Catégories et couleurs/ }).click();
    await page.getByLabel('Nom de la nouvelle catégorie').fill(nomCategorie);
    await page.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByLabel(`Nom de la catégorie ${nomCategorie}`)).toBeVisible({ timeout: 10000 });

    const { data: cat } = await admin!.from('categories_seance').select('id, couleur, est_bilan').eq('nom', nomCategorie).eq('praticien_id', praticienId).single();
    expect(cat, 'la catégorie doit être écrite en base').not.toBeNull();
    categoriesACreer.push(cat!.id);
    expect(cat!.couleur.toUpperCase()).toBe('#8B5CF6');
    expect(cat!.est_bilan).toBe(false);
    await page.getByRole('button', { name: 'Fermer' }).click();

    // ── Créer une séance avec cette catégorie ──
    await page.getByRole('button', { name: '+ Nouvelle séance' }).click();
    const form = page.locator('form');
    await form.locator('select').nth(0).selectOption({ label: nomComplet });
    await form.locator('select').nth(2).selectOption({ label: nomCategorie });
    await form.locator('input[type="date"]').fill(dateSeance);
    await form.locator('input[type="time"]').fill('07:30');
    await form.getByRole('button', { name: 'Créer la séance' }).click();
    await expect(page.getByText('Séance créée')).toBeVisible({ timeout: 10000 });

    const lireSeance = async () => {
      const { data } = await admin!.from('seances').select('id, categorie_id, statut, objectif, notes').eq('participant_id', participantId).eq('date', dateSeance).maybeSingle();
      return data;
    };
    const seance = await lireSeance();
    expect(seance?.categorie_id, 'la séance doit porter la catégorie choisie').toBe(cat!.id);

    // ── La couleur est appliquée dans l'agenda ──
    // Carte = le bloc qui contient le bouton principal portant le nom du bénéficiaire ; le bandeau de
    // couleur est son frère précédent. Évite de viser une autre séance du même jour.
    const boutonCarte = page.getByRole('button', { name: new RegExp(nomComplet) }).first();
    const contenuCarte = boutonCarte.locator('xpath=ancestor::div[1]');
    await expect(contenuCarte.locator('xpath=preceding-sibling::span[@data-testid="bandeau-categorie"]'))
      .toHaveCSS('background-color', 'rgb(139, 92, 246)');
    await expect(contenuCarte.getByText(nomCategorie, { exact: true })).toBeVisible();

    // ── Valider d'un tap ──
    await contenuCarte.getByRole('button', { name: '✓ Valider' }).click();
    await expect(page.getByText('Séance validée')).toBeVisible({ timeout: 10000 });
    await expect.poll(async () => (await lireSeance())?.statut).toBe('realisee');

    // ── Objectif et notes depuis la modale d'édition ──
    await page.getByRole('button', { name: new RegExp(nomComplet) }).first().click();
    const modale = page.locator('.rounded-2xl.shadow-xl.max-w-md');
    await expect(modale.getByRole('heading', { name: 'Modifier la séance' })).toBeVisible();
    await modale.locator('input[type="text"]').fill('Travailler l\'équilibre');
    await modale.locator('textarea').fill(`Note e2e ${marqueur}`);
    await modale.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Séance modifiée')).toBeVisible({ timeout: 10000 });
    await expect.poll(async () => (await lireSeance())?.objectif).toBe('Travailler l\'équilibre');
    expect((await lireSeance())?.notes).toBe(`Note e2e ${marqueur}`);
    // L'édition n'a pas fait perdre la catégorie.
    expect((await lireSeance())?.categorie_id).toBe(cat!.id);

    // ── Supprimer la catégorie : la séance est conservée, sans catégorie ──
    await page.goto(`/agenda?date=${dateSeance}`);
    await page.getByRole('button', { name: /Catégories et couleurs/ }).click();
    await page.getByRole('button', { name: `Supprimer ${nomCategorie}` }).click();
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect.poll(async () => {
      const { data } = await admin!.from('categories_seance').select('id').eq('id', cat!.id);
      return data?.length ?? -1;
    }).toBe(0);
    const apres = await lireSeance();
    expect(apres, 'la séance doit survivre à la suppression de sa catégorie').not.toBeNull();
    expect(apres?.categorie_id).toBeNull();
  });

  test('bilans automatiques : ON pose les bilans à la bonne fréquence, OFF les retire sans toucher au reste', async ({ page }) => {
    test.setTimeout(90000);
    // Aucune catégorie « Bilan » avant ? Alors celle que l'activation crée sera retirée à la fin.
    const { data: avant } = await admin!.from('categories_seance').select('id').eq('praticien_id', praticienId).eq('est_bilan', true);
    const existaitAvant = (avant ?? []).length > 0;

    // Bilan de référence : réalisé il y a 10 jours.
    const refDate = jour(dansJours(-10));
    const { data: ref, error } = await admin!.from('seances').insert({
      praticien_id: praticienId, participant_id: participantId, date: refDate,
      heure_debut: '09:00', heure_fin: '10:00', duree_minutes: 60, type: 'bilan', statut: 'realisee',
    }).select('id').single();
    if (error || !ref) throw new Error(`Création du bilan de référence échouée : ${error?.message}`);

    const autos = async () => {
      const { data } = await admin!.from('seances').select('id, date, categorie_id, type, statut')
        .eq('participant_id', participantId).eq('bilan_auto', true).order('date', { ascending: true });
      return data ?? [];
    };

    await loginPraticien(page);
    await page.goto(`/participant/${participantId}`);
    const interrupteur = page.getByRole('switch', { name: 'Bilans automatiques' });
    await interrupteur.scrollIntoViewIfNeeded();
    await expect(interrupteur).toHaveAttribute('aria-checked', 'false');

    // ── ON (fréquence par défaut : 3 mois) ──
    await interrupteur.click();
    await expect(interrupteur).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    await expect.poll(async () => (await autos()).length, { timeout: 15000 }).toBeGreaterThanOrEqual(3);

    const poses = await autos();
    // Premier bilan prévu = référence + 3 mois ; chaque bilan est un « bilan » planifié, avec une catégorie.
    expect(poses[0].date).toBe(jour(addMonths(new Date(`${refDate}T12:00:00`), 3)));
    for (const b of poses) {
      expect(b.type).toBe('bilan');
      expect(b.statut).toBe('planifiee');
      expect(b.categorie_id, 'les bilans automatiques prennent la catégorie Bilan').not.toBeNull();
    }
    const { data: reglage } = await admin!.from('bilans_auto').select('actif, frequence_mois').eq('participant_id', participantId).single();
    expect(reglage).toEqual({ actif: true, frequence_mois: 3 });
    const { data: catBilan } = await admin!.from('categories_seance').select('id, est_bilan').eq('id', poses[0].categorie_id as string).single();
    expect(catBilan?.est_bilan).toBe(true);
    if (!existaitAvant) categorieBilanCreeeParLeTest = catBilan!.id;

    // ── « Mettre à jour le planning » à fréquence inchangée : ni doublon, ni retrait (mêmes séances) ──
    const idsAvant = poses.map(b => b.id).sort();
    await page.getByRole('button', { name: 'Mettre à jour le planning' }).click();
    await page.waitForTimeout(4000);
    expect((await autos()).map(b => b.id).sort(), 'aucune séance retirée ni ajoutée').toEqual(idsAvant);

    // ── Un bilan déplacé à la main n'est plus automatique (donc jamais retiré) ──
    const deplace = poses[0];
    const decale = new Date(`${deplace.date}T12:00:00`);
    decale.setDate(decale.getDate() + 2);
    const nouvelleDate = jour(decale);
    await page.getByLabel(/^Date du bilan du /).first().fill(nouvelleDate);
    await expect.poll(async () => {
      const { data } = await admin!.from('seances').select('bilan_auto, date').eq('id', deplace.id).single();
      return data?.bilan_auto === false && data?.date === nouvelleDate;
    }, { timeout: 15000 }).toBe(true);

    // ── OFF : les bilans auto à venir disparaissent, la référence et le bilan déplacé restent ──
    await interrupteur.click();
    await expect(interrupteur).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
    await expect.poll(async () => (await autos()).length, { timeout: 15000 }).toBe(0);
    const { data: restants } = await admin!.from('seances').select('id').eq('participant_id', participantId).in('id', [ref.id, deplace.id]);
    expect((restants ?? []).length, 'la référence et le bilan déplacé à la main doivent rester').toBe(2);
    const { data: reglageOff } = await admin!.from('bilans_auto').select('actif').eq('participant_id', participantId).single();
    expect(reglageOff?.actif).toBe(false);
  });

  test('« Bilan » sur la carte ouvre le bilan lié à la séance ; l\'accueil liste les bilans à venir', async ({ page }) => {
    test.setTimeout(60000);
    const demain = jour(dansJours(1));
    const { data: seanceBilan, error } = await admin!.from('seances').insert({
      praticien_id: praticienId, participant_id: participantId, date: demain,
      heure_debut: '06:15', heure_fin: '07:15', duree_minutes: 60, type: 'bilan', statut: 'planifiee',
    }).select('id').single();
    if (error || !seanceBilan) throw new Error(`Création de la séance bilan échouée : ${error?.message}`);

    await loginPraticien(page);

    // ── Accueil refait : progression du jour + bilans à venir ──
    await page.goto('/');
    await expect(page.getByText(/Bonjour /)).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Séances du jour réalisées' })).toBeVisible();
    await expect(page.getByText('Bilans à venir')).toBeVisible();
    await expect(page.getByText(nomComplet).first()).toBeVisible();

    // ── Carte de l'agenda : le bouton Bilan porte l'identifiant de la séance ──
    await page.goto(`/agenda?date=${demain}`);
    await page.getByRole('button', { name: '📋 Bilan' }).click();
    await expect(page).toHaveURL(new RegExp(`/participant/${participantId}/bilan/new\\?seance=${seanceBilan.id}`));
  });
});
