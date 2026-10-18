// tests/db/facturation-ecrans-admin.spec.ts
//
// Écrans « Factures à valider » et « Factures validées » ouverts par un compte ADMIN, contre une VRAIE pile
// Supabase locale. Constaté en prod le 2026-10-18 : l'admin lit toutes les factures par la RLS (lecture seule
// voulue, factures_admin_lecture) mais pas les bénéficiaires des autres praticiens. Sans filtre sur le
// praticien, l'écran listait les brouillons de toute la plateforme, titrés « Bénéficiaire » et signalés
// « il manque la rue, le code postal et la ville ». Les requêtes des écrans filtrent donc sur le praticien
// connecté (src/hooks/useFacturesAValider.ts) : ces tests rejouent exactement ces requêtes.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { adresseBeneficiaireManquante, lireBrouillon, lireFactureValidee, SELECT_BROUILLON, SELECT_FACTURE_VALIDEE } from '../../src/lib/facturesAValider.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Écrans de facturation ouverts par un admin : seulement ses propres factures', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });

  it('l\'admin ne voit que ses brouillons, nommés et sans faux bandeau d\'adresse ; sans le filtre, il voyait ceux des autres sans nom', async () => {
    const mois = moisDuTest();
    const autre = await creerPraticien(serviceClient, anon, true);
    const admin = await creerPraticien(serviceClient, anon, true);
    await creerContrat(autre, mois, { seances: [{ jour: 3 }] });
    await creerContrat(admin, mois, { seances: [{ jour: 4 }] });
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    await pg(c => c.query(`UPDATE public.user_roles SET app_role = 'admin' WHERE user_id = $1 AND app_role = 'praticien'`, [admin.id]));
    try {
      // Ce que faisait l'écran avant (aucun filtre) : l'admin voit le brouillon de l'autre, sans bénéficiaire lisible.
      const sansFiltre = await admin.client.from('factures').select(SELECT_BROUILLON).eq('statut', 'brouillon').eq('type', 'facture').eq('periode', mois.periode);
      const lus = ((sansFiltre.data ?? []) as unknown as Record<string, unknown>[]).map(lireBrouillon);
      const etranger = lus.find(f => f.beneficiaire.prenom === '' && f.beneficiaire.nom === '');
      expect(etranger, 'le bug d\'origine n\'est plus reproductible : revoir ce test').toBeDefined();
      expect(adresseBeneficiaireManquante(etranger!.beneficiaire)).toEqual(['rue', 'code postal', 'ville']);

      // Ce que fait l'écran maintenant (filtre sur le praticien connecté) : seulement son brouillon, nommé, adresse lue.
      const filtre = await admin.client.from('factures').select(SELECT_BROUILLON).eq('praticien_id', admin.id).eq('statut', 'brouillon').eq('type', 'facture').eq('periode', mois.periode);
      const siens = ((filtre.data ?? []) as unknown as Record<string, unknown>[]).map(lireBrouillon);
      expect(siens).toHaveLength(1);
      expect(siens[0].beneficiaire).toMatchObject({ prenom: 'Alice', nom: 'BenefCron' });
      expect(adresseBeneficiaireManquante(siens[0].beneficiaire)).toEqual([]);
    } finally {
      await pg(c => c.query(`UPDATE public.user_roles SET app_role = 'praticien' WHERE user_id = $1 AND app_role = 'admin'`, [admin.id]));
    }
  });

  it('« Factures validées » : l\'admin ne voit que ses factures validées, avec le nom du bénéficiaire', async () => {
    const mois = moisDuTest();
    const autre = await creerPraticien(serviceClient, anon, true);
    const admin = await creerPraticien(serviceClient, anon, true);
    const ca = await creerContrat(autre, mois, { seances: [{ jour: 3 }] });
    const cb = await creerContrat(admin, mois, { seances: [{ jour: 4 }] });
    await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
    for (const [p, c] of [[autre, ca], [admin, cb]] as const) {
      const f = (await lignesDe(c.contratId, mois.periode)).factures[0];
      expect((await p.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
    }
    await pg(c => c.query(`UPDATE public.user_roles SET app_role = 'admin' WHERE user_id = $1 AND app_role = 'praticien'`, [admin.id]));
    try {
      const filtre = await admin.client.from('factures').select(SELECT_FACTURE_VALIDEE).eq('praticien_id', admin.id).neq('statut', 'brouillon');
      const siennes = ((filtre.data ?? []) as unknown as Record<string, unknown>[]).map(lireFactureValidee);
      expect(siennes).toHaveLength(1);
      expect(siennes[0].beneficiaire).toEqual({ prenom: 'Alice', nom: 'BenefCron' });
    } finally {
      await pg(c => c.query(`UPDATE public.user_roles SET app_role = 'praticien' WHERE user_id = $1 AND app_role = 'admin'`, [admin.id]));
    }
  });
});
