import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { skipUnlessPraticien, loginPraticien, env } from '../helpers.js';
import { clientAdminTest } from '../nettoyageTest.js';

// Accueil mobile (23/11/2026, demande de Pierre) : « Marquer comme réalisée » sur la carte de la
// séance, et rappel des séances passées restées planifiées (sinon absentes de la facture).
//
// Aucune connexion patient. Fixtures écrites par le client admin sur un bénéficiaire dédié, puis
// supprimées par identifiant. Chaque validation est relue en base.

async function resoudrePraticienId(admin: SupabaseClient): Promise<string> {
  const { data: usersPage, error } = await admin.auth.admin.listUsers();
  const praticien = error ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${error?.message ?? 'aucune correspondance'}`);
  return praticien.id;
}

const hhmm = (d: Date) => format(d, 'HH:mm');

test.describe.serial('Accueil mobile — valider une séance, séances à confirmer', () => {
  test.describe.configure({ retries: 0 });

  let admin: SupabaseClient | null = null;
  let praticienId = '';
  let participantId = '';
  const marqueur = Date.now().toString(36);
  const nomComplet = `Test E2E${marqueur}`;

  test.beforeAll(async () => {
    if (!env.praticienEmail || !env.praticienPassword || !process.env.E2E_BASE_URL) return;
    admin = clientAdminTest();
    if (!admin) return;
    praticienId = await resoudrePraticienId(admin);
    const { data: participant, error } = await admin.from('participants').insert({
      praticien_id: praticienId,
      prenom: 'Test',
      nom: `E2E${marqueur}`,
      code_acces: `E2E${marqueur}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
      rgpd: { consentementObtenu: true, consentementDate: new Date().toISOString().slice(0, 10), methodeConsentement: 'numerique' },
    }).select('id').single();
    if (error || !participant) throw new Error(`Création participant (fixture e2e) échouée : ${error?.message}`);
    participantId = participant.id;
  });

  test.afterAll(async () => {
    if (!admin || !participantId) return;
    await admin.from('seances').delete().eq('participant_id', participantId);
    await admin.from('participants').delete().eq('id', participantId);
  });

  test.beforeEach(() => {
    skipUnlessPraticien();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture');
  });

  test('une séance passée restée planifiée apparaît dans le rappel et se valide en un geste', async ({ page }) => {
    test.setTimeout(60000);
    const il5Jours = new Date(); il5Jours.setDate(il5Jours.getDate() - 5);
    const { data: seance, error } = await admin!.from('seances').insert({
      praticien_id: praticienId, participant_id: participantId, date: format(il5Jours, 'yyyy-MM-dd'),
      heure_debut: '10:00', heure_fin: '11:00', duree_minutes: 60, type: 'seance', statut: 'planifiee',
    }).select('id').single();
    if (error || !seance) throw new Error(`Création de la séance passée échouée : ${error?.message}`);

    await loginPraticien(page);
    await page.goto('/');
    const rappel = page.getByRole('button', { name: /séances? passées? à confirmer/ });
    await expect(rappel).toBeVisible({ timeout: 15000 });
    await rappel.click();
    await page.getByRole('button', { name: new RegExp(`^Réalisée : ${nomComplet}`) }).click();
    await expect(page.getByText('Séance marquée comme réalisée')).toBeVisible({ timeout: 10000 });

    const { data: apres } = await admin!.from('seances').select('statut').eq('id', seance.id).single();
    expect(apres?.statut).toBe('realisee');
    await expect(page.getByRole('button', { name: new RegExp(`^Réalisée : ${nomComplet}`) })).toHaveCount(0);
  });

  test('la séance en cours reste sur la carte et se marque réalisée depuis l\'accueil', async ({ page }) => {
    test.setTimeout(60000);
    const maintenant = new Date();
    // Séance commencée il y a 10 min : sans objet si elle chevauche minuit.
    test.skip(maintenant.getHours() < 1 || maintenant.getHours() >= 22, 'trop près de minuit pour une séance du jour');
    const debut = new Date(maintenant.getTime() - 10 * 60000);
    const fin = new Date(maintenant.getTime() + 50 * 60000);
    const { data: seance, error } = await admin!.from('seances').insert({
      praticien_id: praticienId, participant_id: participantId, date: format(maintenant, 'yyyy-MM-dd'),
      heure_debut: hhmm(debut), heure_fin: hhmm(fin), duree_minutes: 60, type: 'seance', statut: 'planifiee',
    }).select('id').single();
    if (error || !seance) throw new Error(`Création de la séance du jour échouée : ${error?.message}`);

    await loginPraticien(page);
    await page.goto('/');
    const valider = page.getByRole('button', { name: '✓ Marquer comme réalisée' });
    await expect(valider).toBeVisible({ timeout: 15000 });
    // Le staging partagé peut avoir d'autres séances du jour avant la nôtre : on les écarte à la
    // main (« Passer à la suivante »), ce qui teste aussi ce bouton.
    const carte = valider.locator('xpath=ancestor::div[1]');
    for (let i = 0; i < 40 && !(await carte.getByText(nomComplet).isVisible()); i++) {
      await page.getByRole('button', { name: 'Passer à la suivante →' }).click();
    }
    await expect(carte.getByText(nomComplet)).toBeVisible();
    await valider.click();
    await expect(page.getByText('Séance marquée comme réalisée')).toBeVisible({ timeout: 10000 });

    const { data: apres } = await admin!.from('seances').select('statut').eq('id', seance.id).single();
    expect(apres?.statut).toBe('realisee');
  });
});
