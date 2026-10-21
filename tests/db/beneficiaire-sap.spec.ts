// tests/db/beneficiaire-sap.spec.ts
//
// Bénéficiaire « Hors SAP / SAP » (migration 20261021100000) contre une VRAIE pile Supabase locale :
// un bénéficiaire SAP est exclu de la génération automatique des factures (décision 3 du 2026-10-20),
// par la facture progressive comme par la tâche du mois écoulé ; le passage en SAP retire ses brouillons
// sans toucher une facture émise ; le retour en Hors SAP recrée tout de suite le brouillon du mois.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { dateCivileParis } from '../../src/lib/tarifsContrats.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

/** Mois civil Paris en cours, au format de moisDuTest() : seul mois que le retour en Hors SAP recalcule (avec le précédent). */
function moisCourant(): ReturnType<typeof moisDuTest> {
  const [a, m] = dateCivileParis().split('-').map(Number);
  const mm = String(m).padStart(2, '0');
  const dernier = new Date(a, m, 0).getDate();
  return { periode: `${a}-${mm}-01`, debut: `${a}-${mm}-01`, fin: `${a}-${mm}-${dernier}`, jour: j => `${a}-${mm}-${String(j).padStart(2, '0')}` };
}

decrire('Bénéficiaire SAP : exclu de la génération automatique des factures', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);
  /** Bascule faite par l'écran : mise à jour de la fiche avec le jeton du praticien. */
  const basculer = (p: Praticien, participantId: string, sap: boolean) =>
    p.client.from('participants').update({ beneficiaire_sap: sap }).eq('id', participantId).select('beneficiaire_sap');

  it('un nouveau bénéficiaire est « Hors SAP » par défaut', async () => {
    const p = await pro();
    const c = await creerContrat(p, moisDuTest(), { seances: [] });
    const r = await pg(cl => cl.query(`SELECT beneficiaire_sap FROM public.participants WHERE id = $1`, [c.participantId]));
    expect(r.rows[0].beneficiaire_sap).toBe(false);
  });

  it('facture progressive : une séance réalisée d\'un bénéficiaire SAP ne crée aucun brouillon', async () => {
    const p = await pro();
    const M = moisCourant();
    const c = await creerContrat(p, M, { seances: [] });
    expect((await basculer(p, c.participantId, true)).error).toBeNull();
    await pg(cl => cl.query(
      `INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
       VALUES ($1, $2, $3, $4, '10:00', '10:45', 45, 'seance', 'realisee')`, [c.participantId, p.id, c.contratId, M.jour(1)]));
    expect((await lignesDe(c.contratId, M.periode)).factures).toHaveLength(0);
  });

  it('tâche du mois écoulé : aucun brouillon pour un bénéficiaire SAP, sans erreur ; le Hors SAP voisin est facturé', async () => {
    const p = await pro();
    const M = moisDuTest();
    const sap = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    const horsSap = await creerContrat(p, M, { seances: [{ jour: 4 }] });
    await pg(cl => cl.query(`UPDATE public.participants SET beneficiaire_sap = true WHERE id = $1`, [sap.participantId]));
    const bilan = await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    expect(bilan.erreurs.filter(e => [sap.contratId, horsSap.contratId].includes(e.contratId))).toEqual([]);
    expect((await lignesDe(sap.contratId, M.periode)).factures).toHaveLength(0);
    expect((await lignesDe(horsSap.contratId, M.periode)).factures).toHaveLength(1);
  });

  it('passage en SAP : le brouillon existant est retiré, la séance redevient libre', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 5 }] });
    await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    expect((await lignesDe(c.contratId, M.periode)).factures[0].statut).toBe('brouillon');
    const r = await basculer(p, c.participantId, true);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ beneficiaire_sap: true }]);
    expect((await lignesDe(c.contratId, M.periode)).factures).toHaveLength(0);
    const lignes = await pg(cl => cl.query(`SELECT count(*)::int AS n FROM public.lignes_facture WHERE seance_id = ANY($1)`, [c.seanceIds]));
    expect(lignes.rows[0].n).toBe(0);
  });

  it('passage en SAP : une facture déjà validée n\'est jamais touchée, et n\'est pas recalculée ensuite', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 6 }] });
    await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    expect((await p.client.rpc('valider_facture', { p_facture_id: f.id })).error).toBeNull();
    expect((await basculer(p, c.participantId, true)).error).toBeNull();
    const apres = (await lignesDe(c.contratId, M.periode)).factures;
    expect(apres).toHaveLength(1);
    expect(apres[0]).toMatchObject({ id: f.id, statut: 'validee' });
    // Appel direct de l'entonnoir : renvoie la facture émise telle quelle (elle passe avant la règle SAP).
    const g = await serviceClient.rpc('generer_brouillon_facture', { p_contrat_id: c.contratId, p_periode: M.periode });
    expect(g.error).toBeNull();
    expect(g.data).toBe(f.id);
  });

  it('retour en Hors SAP : le brouillon du mois en cours est recréé tout de suite', async () => {
    const p = await pro();
    const M = moisCourant();
    const c = await creerContrat(p, M, { seances: [{ jour: 1 }] });
    expect((await lignesDe(c.contratId, M.periode)).factures).toHaveLength(1);   // facture progressive
    await basculer(p, c.participantId, true);
    expect((await lignesDe(c.contratId, M.periode)).factures).toHaveLength(0);
    const r = await basculer(p, c.participantId, false);
    expect(r.error).toBeNull();
    const f = (await lignesDe(c.contratId, M.periode)).factures;
    expect(f).toHaveLength(1);
    expect(f[0].statut).toBe('brouillon');
  });

  it('un autre praticien ne peut pas basculer le bénéficiaire (0 ligne)', async () => {
    const a = await pro();
    const b = await pro();
    const c = await creerContrat(a, moisDuTest(), { seances: [] });
    const r = await basculer(b, c.participantId, true);
    expect(r.error).toBeNull();
    expect(r.data ?? []).toEqual([]);
    const v = await pg(cl => cl.query(`SELECT beneficiaire_sap FROM public.participants WHERE id = $1`, [c.participantId]));
    expect(v.rows[0].beneficiaire_sap).toBe(false);
  });
});
