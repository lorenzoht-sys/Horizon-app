// tests/db/facture-presentation.spec.ts
//
// Présentation de la facture (migration 20261022100000, plan facturation PR 4) contre une VRAIE pile
// Supabase locale : frais de déplacement en ligne distincte, durée de la séance dans le libellé, total
// inchangé ; les verrous (tarif utilisé, séance facturée) tiennent toujours.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { API_URL, clesLocales, creerPraticien, moisDuTest, pg, pileDisponible, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Présentation de la facture : frais en ligne distincte, durée des séances', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Contrat à la séance du mois, avec les versions de tarif données et les séances réalisées données. */
  async function contrat(p: Praticien, M: ReturnType<typeof moisDuTest>, tarifs: { debut: number; fin?: number; tarif: number; frais: number }[],
    seances: { jour: number; duree?: number | null; type?: string }[]) {
    const participantId = randomUUID(), contratId = randomUUID();
    const tarifIds: string[] = [];
    await pg(async c => {
      await c.query(`INSERT INTO public.participants (id, praticien_id, nom, prenom, adresse_rue, adresse_code_postal, adresse_ville, rgpd)
                     VALUES ($1, $2, 'Presentation', 'Test', '1 rue', '00000', 'Ville', '{"consentementObtenu":true}'::jsonb)`, [participantId, p.id]);
      await c.query(`INSERT INTO public.contrats (id, participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut, jours_fixe)
                     VALUES ($1, $2, $3, $4, $5, false, 'actif', ARRAY['lun'])`, [contratId, participantId, p.id, M.debut, M.fin]);
      for (const t of tarifs) {
        const id = randomUUID(); tarifIds.push(id);
        await c.query(`INSERT INTO public.tarifs_contrats (id, contrat_id, tarif_seance, frais_deplacement, date_debut_validite, date_fin_validite) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, contratId, t.tarif, t.frais, M.jour(t.debut), t.fin ? M.jour(t.fin) : null]);
      }
      for (const s of seances) {
        await c.query(`INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
                       VALUES ($1, $2, $3, $4, '10:00', '23:59', $5, $6, 'realisee')`, [participantId, p.id, contratId, M.jour(s.jour), s.duree === undefined ? 60 : s.duree, s.type ?? 'seance']);
      }
      if (seances.some(s => s.type === 'bilan')) await c.query(`UPDATE public.contrats SET facturer_bilans = true WHERE id = $1`, [contratId]);
    });
    return { participantId, contratId, tarifIds };
  }
  const generer = async (contratId: string, periode: string) =>
    (await pg(c => c.query(`SELECT public.generer_brouillon_facture($1, $2::date) AS id`, [contratId, periode]))).rows[0].id as string;
  const lignes = (factureId: string) => pg(async c => (await c.query(
    `SELECT l.libelle, l.quantite::float8 AS qte, l.prix_unitaire::float8 AS prix, l.montant::float8 AS montant, l.seance_id IS NOT NULL AS seance, l.tarif_contrat_id
       FROM public.lignes_facture l LEFT JOIN public.seances s ON s.id = l.seance_id
      WHERE l.facture_id = $1 ORDER BY s.date NULLS LAST, l.prix_unitaire`, [factureId])).rows);
  const totalHt = async (id: string) => (await pg(c => c.query(`SELECT total_ht::float8 AS ht FROM public.factures WHERE id = $1`, [id]))).rows[0].ht;

  it('exemple de Pierre : 4 séances d\'1 h à 50 € + 5 € de frais → 4 lignes à 50 €, « Frais de déplacement : 4 × 5 € », 220 €', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await contrat(p, M, [{ debut: 1, tarif: 50, frais: 5 }], [{ jour: 3 }, { jour: 10 }, { jour: 17 }, { jour: 24 }]);
    const id = await generer(c.contratId, M.periode);
    const ls = await lignes(id);
    expect(ls).toHaveLength(5);
    for (const l of ls.slice(0, 4)) expect(l).toMatchObject({ qte: 1, prix: 50, montant: 50, seance: true, tarif_contrat_id: c.tarifIds[0] });
    expect(ls[0].libelle).toBe(`Séance du ${M.jour(3).split('-').reverse().join('/')} à 10:00 (1 h)`);
    expect(ls[4]).toEqual({ libelle: 'Frais de déplacement : 4 × 5 €', qte: 4, prix: 5, montant: 20, seance: false, tarif_contrat_id: null });
    expect(await totalHt(id)).toBe(220);
  });

  it('durée dans le libellé : 45 min, 1 h 30, 2 h, rien si inconnue ; bilan compris', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await contrat(p, M, [{ debut: 1, tarif: 40, frais: 0 }],
      [{ jour: 2, duree: 45 }, { jour: 3, duree: 90 }, { jour: 4, duree: 120 }, { jour: 5, duree: null }, { jour: 6, duree: 60, type: 'bilan' }]);
    const ls = await lignes(await generer(c.contratId, M.periode));
    expect(ls.map(l => l.libelle.replace(/^(Séance|Bilan) du \S+ à 10:00/, '$1'))).toEqual(['Séance (45 min)', 'Séance (1 h 30)', 'Séance (2 h)', 'Séance', 'Bilan (1 h)']);
    expect(ls.some(l => /déplacement/.test(l.libelle))).toBe(false);   // pas de frais : pas de ligne
  });

  it('deux montants de frais dans le mois (changement de tarif) : une ligne par montant, total inchangé', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await contrat(p, M, [{ debut: 1, fin: 14, tarif: 45, frais: 5 }, { debut: 15, tarif: 50, frais: 7.5 }],
      [{ jour: 3 }, { jour: 10 }, { jour: 20 }]);
    const id = await generer(c.contratId, M.periode);
    const frais = (await lignes(id)).filter(l => !l.seance);
    expect(frais).toEqual([
      { libelle: 'Frais de déplacement : 2 × 5 €', qte: 2, prix: 5, montant: 10, seance: false, tarif_contrat_id: null },
      { libelle: 'Frais de déplacement : 1 × 7,50 €', qte: 1, prix: 7.5, montant: 7.5, seance: false, tarif_contrat_id: null },
    ]);
    expect(await totalHt(id)).toBe(45 * 2 + 5 * 2 + 50 + 7.5);   // 157,50 € comme avant la PR
  });

  it('un recalcul reconstruit la ligne des frais (séance ajoutée) sans la dupliquer', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await contrat(p, M, [{ debut: 1, tarif: 50, frais: 5 }], [{ jour: 3 }]);
    const id = await generer(c.contratId, M.periode);
    await pg(cl => cl.query(`INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
                             VALUES ($1, $2, $3, $4, '10:00', '23:59', 60, 'seance', 'realisee')`, [c.participantId, p.id, c.contratId, M.jour(8)]));
    expect(await generer(c.contratId, M.periode)).toBe(id);
    const frais = (await lignes(id)).filter(l => !l.seance);
    expect(frais).toEqual([{ libelle: 'Frais de déplacement : 2 × 5 €', qte: 2, prix: 5, montant: 10, seance: false, tarif_contrat_id: null }]);
  });

  it('après validation : lignes figées, tarif et séances toujours verrouillés', async () => {
    const p = await pro();
    const M = moisDuTest();
    const c = await contrat(p, M, [{ debut: 1, tarif: 50, frais: 5 }], [{ jour: 3 }, { jour: 10 }]);
    const id = await generer(c.contratId, M.periode);
    expect((await p.client.rpc('valider_facture', { p_facture_id: id })).error).toBeNull();
    const refus = (sql: string, params: unknown[]) => pg(cl => cl.query(sql, params).then(() => null, (e: Error) => e.message));
    expect(await refus(`UPDATE public.tarifs_contrats SET frais_deplacement = 6 WHERE id = $1`, [c.tarifIds[0]])).toMatch(/utilisée par une facture émise/);
    expect(await refus(`UPDATE public.tarifs_contrats SET date_fin_validite = $2 WHERE id = $1`, [c.tarifIds[0], M.jour(5)])).toMatch(/après la dernière séance facturée/);
    expect(await refus(`DELETE FROM public.seances WHERE participant_id = $1`, [c.participantId])).toMatch(/factur/i);
    expect(await refus(`DELETE FROM public.lignes_facture WHERE facture_id = $1 AND seance_id IS NULL`, [id])).not.toBeNull();
    expect(await totalHt(id)).toBe(110);
  });
});
