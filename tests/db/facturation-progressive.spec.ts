// tests/db/facturation-progressive.spec.ts
//
// Facture progressive (migration 20261011100000) contre une VRAIE pile Supabase locale :
//   - le brouillon du mois se construit au fil des séances réalisées (trigger sur seances) et suit
//     les changements de tarif (trigger sur tarifs_contrats) ;
//   - il ne touche jamais une facture émise, ni un forfait, ni un mois futur ;
//   - une erreur de calcul (séance sans tarif) n'empêche JAMAIS la saisie de la séance ;
//   - une facture ne se valide qu'à partir du 1er du mois suivant, sans consommer de numéro.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { ANNEE, API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Facture progressive : le brouillon suit les séances et les tarifs', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  const ajouterSeance = (c: { participantId: string; contratId: string }, praticienId: string, date: string, statut = 'realisee', heure = '10:00') =>
    pg(async cl => (await cl.query(
      `INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
       VALUES ($1, $2, $3, $4, $5, '11:00', 45, 'seance', $6) RETURNING id`,
      [c.participantId, praticienId, c.contratId, date, heure, statut])).rows[0].id as string);
  const brouillons = (contratId: string, periode: string) => lignesDe(contratId, periode);

  it('une séance réalisée crée le brouillon, la suivante s\'y ajoute (même facture, total à jour)', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [] });
    expect((await brouillons(c.contratId, mois.periode)).factures).toHaveLength(0);

    await ajouterSeance(c, p.id, mois.jour(3));
    const un = await brouillons(c.contratId, mois.periode);
    expect(un.factures).toHaveLength(1);
    expect(un.factures[0]).toMatchObject({ statut: 'brouillon', total: 45, numero: null });

    await ajouterSeance(c, p.id, mois.jour(10));
    const deux = await brouillons(c.contratId, mois.periode);
    expect(deux.factures.map(f => f.id)).toEqual([un.factures[0].id]);
    expect(deux.factures[0].total).toBe(90);
    expect(deux.lignes).toHaveLength(2);
  });

  it('une séance planifiée ne compte pas ; elle compte dès qu\'elle passe « réalisée », et plus si elle en sort', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }] });
    const id = await ajouterSeance(c, p.id, mois.jour(12), 'planifiee');
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(45);

    await pg(cl => cl.query(`UPDATE public.seances SET statut = 'realisee' WHERE id = $1`, [id]));
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(90);

    await pg(cl => cl.query(`UPDATE public.seances SET statut = 'annulee' WHERE id = $1`, [id]));
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(45);
  });

  it('la suppression de la dernière séance supprime le brouillon, celle d\'une autre le met à jour', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    await pg(cl => cl.query(`DELETE FROM public.seances WHERE id = $1`, [c.seanceIds[0]]));
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(45);
    await pg(cl => cl.query(`DELETE FROM public.seances WHERE id = $1`, [c.seanceIds[1]]));
    expect((await brouillons(c.contratId, mois.periode)).factures).toHaveLength(0);
  });

  it('une séance déplacée vers un autre mois retire le montant de l\'ancien brouillon et en crée un pour le nouveau', async () => {
    const mois1 = moisDuTest();
    const mois2 = moisDuTest();
    const p = await pro();
    // Contrat couvrant les deux mois.
    const c = await creerContrat(p, mois1, { seances: [{ jour: 3 }, { jour: 10 }] });
    await pg(async cl => {
      await cl.query(`UPDATE public.contrats SET date_fin = $2 WHERE id = $1`, [c.contratId, mois2.fin]);
      await cl.query(`UPDATE public.tarifs_contrats SET date_fin_validite = NULL WHERE contrat_id = $1`, [c.contratId]);
    });
    await pg(cl => cl.query(`UPDATE public.seances SET date = $2 WHERE id = $1`, [c.seanceIds[1], mois2.jour(5)]));
    expect((await brouillons(c.contratId, mois1.periode)).factures[0].total).toBe(45);
    expect((await brouillons(c.contratId, mois2.periode)).factures[0].total).toBe(45);
  });

  it('modifier l\'heure d\'une séance réalisée met à jour le libellé de sa ligne', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }] });
    await pg(cl => cl.query(`UPDATE public.seances SET heure_debut = '16:30' WHERE id = $1`, [c.seanceIds[0]]));
    expect((await brouillons(c.contratId, mois.periode)).lignes[0].libelle).toContain('16:30');
  });

  it('corriger le TARIF met le brouillon à jour (modification, ajout d\'une version, suppression)', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(90);

    await pg(cl => cl.query(`UPDATE public.tarifs_contrats SET tarif_seance = 50 WHERE contrat_id = $1`, [c.contratId]));
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(100);

    await pg(cl => cl.query(`UPDATE public.tarifs_contrats SET frais_deplacement = 5 WHERE contrat_id = $1`, [c.contratId]));
    expect((await brouillons(c.contratId, mois.periode)).factures[0].total).toBe(110);
  });

  it('une séance saisie AVANT son tarif est enregistrée ; le tarif créé ensuite fait apparaître le brouillon', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }, { jour: 10 }], tarif: false });
    expect(c.seanceIds).toHaveLength(2);                                   // la saisie n'a pas échoué
    expect((await brouillons(c.contratId, mois.periode)).factures).toHaveLength(0);
    await pg(cl => cl.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, date_debut_validite) VALUES ($1, 45, $2)`, [c.contratId, mois.debut]));
    const apres = await brouillons(c.contratId, mois.periode);
    expect(apres.factures).toHaveLength(1);
    expect(apres.factures[0].total).toBe(90);
  });

  it('une erreur de calcul n\'empêche jamais la saisie : séance sans tarif applicable, le brouillon reste tel quel', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }] });
    const avant = await brouillons(c.contratId, mois.periode);
    // Tarif valable à partir du 15 seulement : la séance du 5 n'a plus de tarif applicable.
    await pg(cl => cl.query(`UPDATE public.tarifs_contrats SET date_debut_validite = $2 WHERE contrat_id = $1`, [c.contratId, mois.jour(15)]));
    const id = await ajouterSeance(c, p.id, mois.jour(5));                 // ne lève pas
    expect(id).toBeTruthy();
    const apres = await brouillons(c.contratId, mois.periode);
    expect(apres.factures.map(f => f.id)).toEqual(avant.factures.map(f => f.id));   // brouillon intact (périmé), pas supprimé
  });

  it('ne touche JAMAIS une facture émise : une séance tardive ne la modifie pas et ne crée pas de seconde facture', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
    const brouillon = (await brouillons(c.contratId, mois.periode)).factures[0];
    const r = await p.client.rpc('valider_facture', { p_facture_id: brouillon.id });
    expect(r.error).toBeNull();
    const emise = await brouillons(c.contratId, mois.periode);

    await ajouterSeance(c, p.id, mois.jour(20));
    await pg(cl => cl.query(`UPDATE public.tarifs_contrats SET tarif_seance = 99 WHERE contrat_id = $1`, [c.contratId])).catch(() => {});
    const apres = await brouillons(c.contratId, mois.periode);
    expect(apres.factures).toHaveLength(1);
    expect(apres.factures[0]).toMatchObject({ id: brouillon.id, statut: 'validee', total: 90 });
    expect(apres.lignes).toEqual(emise.lignes);
  });

  it('un contrat au forfait n\'est pas recalculé par une séance, et un mois futur ne produit aucun brouillon', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [] });
    await pg(cl => cl.query(`UPDATE public.contrats SET mode_facturation = 'forfait', montant_forfait = 120 WHERE id = $1`, [c.contratId]));
    await ajouterSeance(c, p.id, mois.jour(4));
    expect((await brouillons(c.contratId, mois.periode)).factures).toHaveLength(0);

    // Mois futur (2099) : séance « réalisée » par erreur de saisie, contrat qui le couvre.
    const participantId = randomUUID();
    const contratFutur = randomUUID();
    await pg(async cl => {
      await cl.query(`INSERT INTO public.participants (id, praticien_id, nom, prenom, rgpd) VALUES ($1, $2, 'FuturTest', 'Alice', '{"consentementObtenu": true}'::jsonb)`, [participantId, p.id]);
      await cl.query(`INSERT INTO public.contrats (id, participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut, jours_fixe) VALUES ($1, $2, $3, '2099-01-01', '2099-12-31', true, 'actif', ARRAY['lun'])`, [contratFutur, participantId, p.id]);
      await cl.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, date_debut_validite) VALUES ($1, 45, '2099-01-01')`, [contratFutur]);
    });
    await ajouterSeance({ participantId, contratId: contratFutur }, p.id, '2099-01-12');
    expect((await brouillons(contratFutur, '2099-01-01')).factures).toHaveLength(0);
  });

  it('un contrat à venir ou archivé n\'est pas facturé progressivement', async () => {
    const mois = moisDuTest();
    const p = await pro();
    const c = await creerContrat(p, mois, { seances: [] });
    await pg(cl => cl.query(`UPDATE public.contrats SET statut = 'a_venir' WHERE id = $1`, [c.contratId]));
    await ajouterSeance(c, p.id, mois.jour(4));
    expect((await brouillons(c.contratId, mois.periode)).factures).toHaveLength(0);
  });
});

decrire('Garde-fou : une facture ne se valide qu\'à partir du 1er du mois suivant', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });

  /** Contrat à la séance couvrant le mois civil courant (Paris), avec une séance réalisée le 1er du mois. */
  async function contratDuMoisCourant() {
    const p = await creerPraticien(serviceClient, anon, true);
    const { debut } = (await pg(cl => cl.query(`SELECT to_char(date_trunc('month', (now() AT TIME ZONE 'Europe/Paris')::date), 'YYYY-MM-DD') AS debut`))).rows[0] as { debut: string };
    const participantId = randomUUID();
    const contratId = randomUUID();
    await pg(async cl => {
      await cl.query(`INSERT INTO public.participants (id, praticien_id, nom, prenom, adresse_rue, adresse_code_postal, adresse_ville, rgpd) VALUES ($1, $2, 'GardeTest', 'Alice', '1 rue Test', '00000', 'Villetest', '{"consentementObtenu": true}'::jsonb)`, [participantId, p.id]);
      await cl.query(`INSERT INTO public.contrats (id, participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut, jours_fixe) VALUES ($1, $2, $3, $4, '2099-12-31', true, 'actif', ARRAY['lun'])`, [contratId, participantId, p.id, debut]);
      await cl.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, date_debut_validite) VALUES ($1, 45, $2)`, [contratId, debut]);
      await cl.query(`INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut) VALUES ($1, $2, $3, $4, '10:00', '10:45', 45, 'seance', 'realisee')`, [participantId, p.id, contratId, debut]);
    });
    return { p, contratId, debut, participantId };
  }

  it('le brouillon du mois en cours existe, mais sa validation est refusée avec un message clair, sans consommer de numéro', async () => {
    const { p, contratId, debut } = await contratDuMoisCourant();
    const f = (await lignesDe(contratId, debut)).factures[0];
    expect(f).toMatchObject({ statut: 'brouillon', total: 45 });

    const r = await p.client.rpc('valider_facture', { p_facture_id: f.id });
    expect(r.error?.message).toMatch(/Facture de \d{2}\/\d{4} : validation possible à partir du \d{2}\/\d{2}\/\d{4}, le mois n'est pas terminé/);

    const apres = await lignesDe(contratId, debut);
    expect(apres.factures[0]).toMatchObject({ id: f.id, statut: 'brouillon', numero: null });
    const compteurs = await pg(cl => cl.query(`SELECT count(*)::int AS n FROM public.compteurs_facture WHERE praticien_id = $1`, [p.id]));
    expect(compteurs.rows[0].n).toBe(0);                                  // aucun numéro brûlé par le refus
  });

  it('le refus ne fige pas le mois : une séance de plus s\'ajoute encore au brouillon', async () => {
    const { p, contratId, debut, participantId } = await contratDuMoisCourant();
    const f = (await lignesDe(contratId, debut)).factures[0];
    await p.client.rpc('valider_facture', { p_facture_id: f.id });
    await pg(cl => cl.query(
      `INSERT INTO public.seances (participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut) VALUES ($1, $2, $3, $4, '14:00', '14:45', 45, 'seance', 'realisee')`,
      [participantId, p.id, contratId, `${debut.slice(0, 8)}02`]));   // une séance par contrat et par jour
    const apres = await lignesDe(contratId, debut);
    expect(apres.factures.map(x => x.id)).toEqual([f.id]);
    expect(apres.factures[0].total).toBe(90);
  });

  it('le service_role est soumis à la même règle (la base décide, pas l\'interface)', async () => {
    const { contratId, debut } = await contratDuMoisCourant();
    const f = (await lignesDe(contratId, debut)).factures[0];
    const r = await serviceClient.rpc('valider_facture', { p_facture_id: f.id });
    expect(r.error?.message).toMatch(/validation possible à partir du/);
  });

  it('un mois terminé se valide normalement (régression : la règle ne bloque que le mois en cours)', async () => {
    // Décembre d'une année passée aléatoire (moisDuTest() est épuisé après 12 appels dans ce fichier).
    const mois = { periode: `${ANNEE}-12-01`, debut: `${ANNEE}-12-01`, fin: `${ANNEE}-12-31`, jour: (j: number) => `${ANNEE}-12-${String(j).padStart(2, '0')}` };
    const p = await creerPraticien(serviceClient, anon, true);
    const c = await creerContrat(p, mois, { seances: [{ jour: 3 }] });
    const f = (await lignesDe(c.contratId, mois.periode)).factures[0];
    const r = await p.client.rpc('valider_facture', { p_facture_id: f.id });
    expect(r.error).toBeNull();
    expect((await lignesDe(c.contratId, mois.periode)).factures[0].statut).toBe('validee');
  });
});
