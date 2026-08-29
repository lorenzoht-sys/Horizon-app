import { test, expect } from '@playwright/test';
import { skipUnlessE2E, env } from './helpers.js';

test.describe('Portail structure', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un token valide affiche les patients rattachés à la structure', async ({ page }) => {
    await page.goto(`/structure/${env.structureToken}`);

    await expect(page.getByText(`${env.patientPrenom2} ${env.patientNom2}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voir le détail →' })).toBeVisible();
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
    const res = await request.get('/api/structure/data', {
      headers: { 'x-structure-token': env.structureToken },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(
      Array.isArray(body.participants) && body.participants.length > 0,
      'aucun bénéficiaire rattaché à la structure de démo — ce test ne prouverait rien'
    ).toBe(true);

    const autorisees = [
      'bilans', 'date_creation', 'date_naissance', 'id', 'nom', 'prenom',
      'programmes', 'structure_id',
    ];
    for (const p of body.participants) {
      expect(Object.keys(p).sort()).toEqual(autorisees);
    }
  });

  test('un token invalide affiche un message d\'accès non autorisé', async ({ page }) => {
    await page.goto('/structure/token-invalide-0000');

    await expect(page.getByText('Accès non autorisé')).toBeVisible();
    await expect(page.getByText('Ce lien est invalide ou a expiré.')).toBeVisible();
  });
});
