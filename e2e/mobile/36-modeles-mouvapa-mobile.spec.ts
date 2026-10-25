import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Bibliothèque Mouv'APA (2026-10-25) : les modèles prêts à l'emploi sont un catalogue partagé, dans
// le code. Ce fichier prouve, sur le vrai Preview et en relisant la base :
//   1. « Ajouter à mes modèles » crée une copie complète dans la bibliothèque de l'enseignant ;
//   2. « Utiliser » depuis la fiche crée un programme bénéficiaire ;
//   3. modifier ce programme ne modifie pas le modèle d'où il vient.
//
// Aucune connexion patient (quota partagé, voir CLAUDE.md). Bénéficiaire de test dédié, créé et
// supprimé par le client admin ; modèles créés supprimés par identifiant précis.

const NOM_MODELE_COPIE = 'Full Body – 100 % assis';
const NOM_MODELE_APPLIQUE = 'Pilates chaise – débutant';

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

async function idsModeles(admin: SupabaseClient, praticienId: string, nom: string): Promise<string[]> {
  const { data } = await admin.from('programmes_modeles').select('id').eq('praticien_id', praticienId).eq('nom', nom);
  return (data ?? []).map(r => r.id as string);
}

test.describe.serial('Modèles Mouv\'APA — copie et application (390×844)', () => {
  test.describe.configure({ retries: 0 });

  let admin: SupabaseClient | null = null;
  let praticienId = '';
  let participantId = '';
  const marqueur = Date.now().toString(36);
  const nomComplet = `Test E2E${marqueur}`;
  const modelesAvant = new Map<string, Set<string>>();

  test.beforeAll(async () => {
    if (!env.praticienEmail || !env.praticienPassword || !process.env.E2E_BASE_URL) return;
    admin = clientAdminTest();
    if (!admin) return;
    praticienId = await resoudrePraticienId(admin);
    for (const nom of [NOM_MODELE_COPIE, NOM_MODELE_APPLIQUE]) modelesAvant.set(nom, new Set(await idsModeles(admin, praticienId, nom)));
    const { data: participant, error } = await admin
      .from('participants')
      .insert({
        praticien_id: praticienId,
        prenom: 'Test',
        nom: `E2E${marqueur}`,
        code_acces: `E2E${marqueur}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
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
      await admin.from('programmes').delete().eq('participant_id', participantId);
      await admin.from('participants').delete().eq('id', participantId);
    }
    // Seulement les modèles créés par CE run (absents avant), chacun par son identifiant.
    for (const [nom, avant] of modelesAvant) {
      for (const id of await idsModeles(admin, praticienId, nom)) {
        if (!avant.has(id)) await admin.from('programmes_modeles').delete().eq('id', id).eq('praticien_id', praticienId);
      }
    }
  });

  test.beforeEach(() => {
    skipUnlessPraticien();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('prévisualiser puis « Ajouter à mes modèles » crée une copie complète', async ({ page }) => {
    test.setTimeout(60000);
    await loginPraticien(page);
    await page.goto('/bibliotheque');
    await page.getByRole('button', { name: 'Modèles de programme' }).click();
    await page.getByRole('tab', { name: /Modèles Mouv'APA/ }).click();
    await page.getByRole('button', { name: '100 % assis', exact: true }).click();
    await page.getByLabel('Rechercher un modèle').fill(NOM_MODELE_COPIE);

    const carte = page.getByText(NOM_MODELE_COPIE, { exact: true }).locator('xpath=ancestor::div[1]');
    await carte.getByRole('button', { name: 'Prévisualiser' }).click();
    await expect(page.locator('ol > li')).toHaveCount(9);
    await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
    await expect(page.locator('ol > li')).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, 'pas de défilement horizontal à 390 px').toBe(false);

    await carte.getByRole('button', { name: 'Ajouter à mes modèles' }).click();
    await expect(page.getByText(`« ${NOM_MODELE_COPIE} » ajouté à vos modèles`)).toBeVisible({ timeout: 15000 });

    const nouveaux = (await idsModeles(admin!, praticienId, NOM_MODELE_COPIE)).filter(id => !modelesAvant.get(NOM_MODELE_COPIE)!.has(id));
    expect(nouveaux).toHaveLength(1);
    const { data: seances } = await admin!.from('programme_modele_seances').select('id').eq('modele_id', nouveaux[0]);
    expect(seances ?? []).toHaveLength(1);
    const { data: exos } = await admin!.from('programme_modele_exercices').select('id').eq('seance_id', seances![0].id);
    expect(exos ?? []).toHaveLength(9);
    const { data: planning } = await admin!.from('programme_modele_planning').select('jour').eq('modele_id', nouveaux[0]);
    expect((planning ?? []).map(p => p.jour).sort()).toEqual(['lundi', 'mercredi', 'vendredi']);

    await page.getByRole('tab', { name: /Mes modèles/ }).click();
    await expect(page.getByText(NOM_MODELE_COPIE).first()).toBeVisible();
  });

  test('« Utiliser » depuis la fiche crée un programme ; le modifier ne touche pas le modèle', async ({ page }) => {
    test.setTimeout(60000);
    await loginPraticien(page);
    await page.goto(`/participant/${participantId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Utiliser un modèle' }).click();
    await page.getByRole('tab', { name: /Modèles Mouv'APA/ }).click();
    await page.getByLabel('Rechercher un modèle').fill(NOM_MODELE_APPLIQUE);
    const carte = page.getByText(NOM_MODELE_APPLIQUE, { exact: true }).locator('xpath=ancestor::div[1]');
    await carte.getByRole('button', { name: 'Utiliser', exact: true }).click();
    await expect(page.getByText('Modèle appliqué au bénéficiaire !')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(nomComplet).first()).toBeVisible();

    const { data: programmes } = await admin!.from('programmes').select('id, titre').eq('participant_id', participantId);
    expect(programmes ?? []).toHaveLength(1);
    expect(programmes![0].titre).toBe(NOM_MODELE_APPLIQUE);
    const { data: seancesProg } = await admin!.from('programme_seances').select('id').eq('programme_id', programmes![0].id);
    const { data: exosProg } = await admin!.from('programme_exercices').select('id, series').eq('seance_id', seancesProg![0].id);
    expect(exosProg ?? []).toHaveLength(6);

    // Le programme est individualisé : on modifie un exercice…
    await admin!.from('programme_exercices').update({ series: 9 }).eq('id', exosProg![0].id);

    // …et la copie du modèle chez l'enseignant reste intacte.
    const copies = (await idsModeles(admin!, praticienId, NOM_MODELE_APPLIQUE)).filter(id => !modelesAvant.get(NOM_MODELE_APPLIQUE)!.has(id));
    expect(copies).toHaveLength(1);
    const { data: seancesModele } = await admin!.from('programme_modele_seances').select('id').eq('modele_id', copies[0]);
    const { data: exosModele } = await admin!.from('programme_modele_exercices').select('series').eq('seance_id', seancesModele![0].id);
    expect((exosModele ?? []).some(e => e.series === 9)).toBe(false);
  });
});
