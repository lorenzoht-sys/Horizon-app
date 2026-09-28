import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skipUnlessE2E, env } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

// Ce fichier dépendait d'une structure de démo (token E2E_STRUCTURE_TOKEN,
// par défaut 'staging-token-demo-0001') censée être posée par
// scripts/seed-staging.sql — jamais rejoué sur le projet Supabase de staging
// actuel, donc absente (constaté le 2026-09-28 : le portail répond 401 pour
// ce token). tests/security/rls.spec.ts a le même symptôme et s'en
// accommode par un avertissement suivi d'un retour anticipé.
//
// Plutôt que recréer cette fixture de démo partagée, chaque test ci-dessous
// crée sa PROPRE structure, avec un participant et un bilan dédiés, et
// nettoie les trois par identifiant précis dans un `finally`. Aucune donnée
// partagée (Camille, Julien, la structure de démo) n'est lue ni modifiée :
// zéro dépendance à un état préexistant.

interface FixtureStructure {
  structureId: string;
  token: string;
  participantId: string;
  nomComplet: string;
}

// Le praticien propriétaire est résolu via l'API Admin Auth (par email),
// jamais via un participant existant — pour ne dépendre d'aucune donnée de
// démo préexistante.
//
// Auto-nettoyante en cas d'échec partiel : un premier essai (avant l'ajout du
// consentement RGPD requis par trigger, voir plus bas) a laissé deux
// structures orphelines — la création du participant avait échoué APRÈS
// celle de la structure, et l'appel entier se trouvait hors du try/finally
// de l'appelant, qui ne s'exécute jamais si cette fonction elle-même lève.
// Chaque étape annule donc ici ce qu'elle vient de créer avant de
// propager l'erreur, plutôt que de compter sur l'appelant.
async function creerFixtureStructure(admin: SupabaseClient, marqueur: string): Promise<FixtureStructure> {
  const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers();
  const praticien = usersErr ? undefined : usersPage.users.find(u => u.email === env.praticienEmail);
  if (!praticien) throw new Error(`Praticien e2e introuvable (${env.praticienEmail}) : ${usersErr?.message ?? 'aucune correspondance'}`);

  const { data: structure, error: structureErr } = await admin
    .from('structures')
    .insert({
      praticien_id: praticien.id,
      nom: `E2E ${marqueur}`,
      contact_email: 'e2e-structure@test.local',
      token_acces: `e2e-${marqueur}`,
      actif: true,
    })
    .select('id, token_acces')
    .single();
  if (structureErr || !structure) throw new Error(`Création structure (fixture e2e) échouée : ${structureErr?.message}`);

  try {
    const prenom = 'Test';
    const nom = `E2E${marqueur}`;
    const { data: participant, error: participantErr } = await admin
      .from('participants')
      .insert({
        praticien_id: praticien.id,
        structure_id: structure.id,
        prenom,
        nom,
        date_naissance: '1950-01-01',
        // Trigger BEFORE INSERT trg_participants_consentement_rgpd_creation
        // (supabase/migrations/20260913_rgpd_consentement_creation.sql) :
        // refuse toute création sans rgpd.consentementObtenu === true, y
        // compris via service_role.
        rgpd: { consentementObtenu: true, consentementDate: new Date().toISOString().slice(0, 10), methodeConsentement: 'numerique' },
      })
      .select('id')
      .single();
    if (participantErr || !participant) throw new Error(`Création participant (fixture e2e) échouée : ${participantErr?.message}`);

    try {
      // Les cinq mesures sont exactement celles que le portail expose (voir
      // api/structure/data.ts) — valeurs arbitraires mais toutes renseignées,
      // pour que le test de colonnes ait un bilan à inspecter.
      const { error: bilanErr } = await admin
        .from('bilans')
        .insert({
          participant_id: participant.id,
          praticien_id: praticien.id,
          date: new Date().toISOString().slice(0, 10),
          type: 'initial',
          equilibre_droite: 12,
          chair_stand_30: 14,
          hand_grip_droite: 22,
          tug_3m: 7.5,
          tm6_distance_metres: 350,
        });
      if (bilanErr) throw new Error(`Création bilan (fixture e2e) échouée : ${bilanErr.message}`);
    } catch (err) {
      await admin.from('participants').delete().eq('id', participant.id);
      throw err;
    }

    return { structureId: structure.id, token: structure.token_acces as string, participantId: participant.id, nomComplet: `${prenom} ${nom}` };
  } catch (err) {
    await admin.from('structures').delete().eq('id', structure.id);
    throw err;
  }
}

// Nettoyage ciblé par identifiant précis, jamais par filtre large : supprimer
// le participant emporte son bilan par ON DELETE CASCADE (supabase/schema.sql),
// la structure est supprimée séparément.
async function nettoyerFixtureStructure(admin: SupabaseClient, fixture: Pick<FixtureStructure, 'structureId' | 'participantId'>): Promise<void> {
  await admin.from('participants').delete().eq('id', fixture.participantId);
  await admin.from('structures').delete().eq('id', fixture.structureId);
}

test.describe('Portail structure', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un token valide affiche les patients rattachés à la structure', async ({ page }) => {
    const admin = clientAdminTest();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture structure');

    const fixture = await creerFixtureStructure(admin!, `portail-ui-${Date.now()}`);
    try {
      await page.goto(`/structure/${fixture.token}`);

      await expect(page.getByText(fixture.nomComplet)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Voir le détail →' })).toBeVisible();
    } finally {
      await nettoyerFixtureStructure(admin!, fixture);
    }
  });

  // Garde-fou de non-régression sur ce que le portail met SUR LE FIL.
  //
  // `api/structure/data.ts` renvoyait `select('*')` sur `participants`, donc
  // le `code_acces` de chaque bénéficiaire rattaché — un justificatif
  // d'identité qui ouvre son espace personnel en écriture, et qui n'expire
  // pas, là où le token structure expire. Corrigé le 2026-08-27 par une liste
  // explicite de colonnes.
  //
  // L'assertion porte sur l'ÉGALITÉ de l'ensemble des clés, pas seulement sur
  // l'absence de `code_acces` : toute colonne ajoutée un jour au `select`
  // fera échouer ce test tant que quelqu'un ne l'aura pas délibérément
  // inscrite ici. C'est le seul moyen d'empêcher la fuite de revenir par une
  // colonne à laquelle personne n'a pensé.
  test('le portail ne met sur le fil que les colonnes autorisées (jamais le code d\'accès)', async ({ request }) => {
    const admin = clientAdminTest();
    test.skip(!admin, 'SUPABASE_TEST_SERVICE_ROLE_KEY non défini (voir e2e/README.md) — impossible de créer la fixture structure');

    const fixture = await creerFixtureStructure(admin!, `portail-colonnes-${Date.now()}`);
    try {
      const res = await request.get('/api/structure/data', {
        headers: { 'x-structure-token': fixture.token },
      });
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(
        Array.isArray(body.participants) && body.participants.length > 0,
        'fixture structure e2e vide — ce test ne prouverait rien'
      ).toBe(true);

      const autorisees = [
        'bilans', 'date_creation', 'date_naissance', 'id', 'nom', 'prenom',
        'programmes', 'structure_id',
      ];
      for (const p of body.participants) {
        expect(Object.keys(p).sort()).toEqual(autorisees);
      }

      // Même exigence un cran plus bas, sur les bilans imbriqués : ils
      // portaient `notes_professionnelles`, `points_vigilance`, `notes_bilan`
      // et `interpretation_ia` — les notes internes du praticien. Les sept
      // colonnes ci-dessous sont exactement celles que le portail affiche.
      const bilanAutorisees = [
        'chair_stand_30', 'date', 'equilibre_droite', 'hand_grip_droite',
        'id', 'tm6_distance_metres', 'tug_3m',
      ];
      const bilans = body.participants.flatMap((p: { bilans?: unknown[] }) => p.bilans ?? []);
      expect(
        bilans.length,
        'fixture structure e2e sans bilan — cette partie du test ne prouverait rien'
      ).toBeGreaterThan(0);
      for (const b of bilans) {
        expect(Object.keys(b as object).sort()).toEqual(bilanAutorisees);
      }
    } finally {
      await nettoyerFixtureStructure(admin!, fixture);
    }
  });

  test('un token invalide affiche un message d\'accès non autorisé', async ({ page }) => {
    await page.goto('/structure/token-invalide-0000');

    await expect(page.getByText('Accès non autorisé')).toBeVisible();
    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
  });
});
