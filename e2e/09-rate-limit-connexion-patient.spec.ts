import { test, expect } from '@playwright/test';
import { skipUnlessE2E } from './helpers.js';
import { clientAdminTest } from './nettoyageTest.js';

test.describe('Limitation des tentatives de connexion patient', () => {
  test.beforeEach(() => skipUnlessE2E());

  test('un code invalide répété déclenche une limitation (429)', async ({ request }) => {
    // Horodatage AVANT la première tentative : sert au nettoyage ci-dessous.
    const debut = new Date().toISOString();
    let limited = false;

    try {
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
    } finally {
      // Nettoyage ciblé par horodatage : cette table (patient_login_attempts)
      // ne contient QUE du bruit de rate-limit (ip + created_at, aucune
      // donnée utilisateur) — épuiser volontairement son quota ici bloquerait
      // sinon TOUT AUTRE test de connexion patient du même run CI pendant les
      // 15 minutes suivantes (même IP de sortie du runner). Constaté :
      // 32-signalement-absence-seance.spec.ts s'est fait bloquer par ce test
      // à répétition avant ce correctif.
      const admin = clientAdminTest();
      if (admin) await admin.from('patient_login_attempts').delete().gte('created_at', debut);
    }
  });
});
