import { test, expect } from '@playwright/test';
import { skipUnlessE2E } from './helpers.js';

test.describe('Limitation des tentatives de connexion patient', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un code invalide répété déclenche une limitation (429)', async ({ request }) => {
    let limited = false;

    // 5 tentatives / 15 min / IP (api/_lib/patientAuth.ts). L'état du rate
    // limit peut déjà être partiellement consommé par de précédentes
    // exécutions de la suite : on boucle donc jusqu'à 6 fois et on accepte
    // un 429 dès qu'il survient.
    for (let i = 0; i < 6; i++) {
      const res = await request.post('/api/patient/session', {
        data: { code: 'code-invalide-e2e' },
      });

      if (res.status() === 429) {
        const body = await res.json();
        expect(body.error).toContain('Trop de tentatives');
        limited = true;
        break;
      }

      expect(res.status()).toBe(401);
    }

    expect(limited).toBe(true);
  });
});
