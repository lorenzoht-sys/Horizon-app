// tests/db/facturation-profil.spec.ts
//
// Écran « Profil de facturation » (facturation, étape 4) contre une VRAIE pile Supabase locale :
// Postgres, PostgREST, GoTrue. Le formulaire lit et écrit `praticiens` DIRECTEMENT avec le jeton
// du praticien (aucune route /api) : ces tests rejouent exactement ses requêtes
// (SELECT_PROFIL_FACTURATION, formulaireVersMiseAJour) et prouvent :
//   - la persistance et la relecture ;
//   - la RLS : un praticien ne lit ni ne modifie le profil d'un autre ;
//   - les contraintes de TVA de la base, et leur parité avec les contrôles de l'interface ;
//   - le bout en bout : profil incomplet = validation refusée avec le bon message, profil complété
//     par le formulaire = validation acceptée, et l'interface PRÉVOIT le message du serveur.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createClient } from '@supabase/supabase-js';
import { describe, it, expect } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { lireProfil, profilFacturationManquant, SELECT_PROFIL } from '../../src/lib/facturesAValider.js';
import {
  FORMULAIRE_VIDE, SELECT_PROFIL_FACTURATION, champsManquantsPourValider, formulaireVersMiseAJour,
  lireFormulaire, lireIdentite, validerFormulaire, type FormulaireFacturation,
} from '../../src/lib/profilFacturation.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

decrire('Profil de facturation : écriture directe sous la RLS', () => {
  const { service, anon } = clesLocales()!;
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, false);   // profil incomplet : ni SIRET ni régime de TVA

  /** Ce que fait le formulaire à l'enregistrement. */
  const enregistrerComme = (client: Awaited<ReturnType<typeof pro>>['client'], id: string, f: FormulaireFacturation) =>
    client.from('praticiens').update(formulaireVersMiseAJour(f)).eq('id', id).select(SELECT_PROFIL_FACTURATION);

  const complet: FormulaireFacturation = {
    regimeTva: 'assujetti', tauxTva: '5.5', agrementSap: true, dateDeclarationSap: '2026-03-04', modeIntervention: 'prestataire',
    adresseIntervention: '2 rue B', facturationRue: '3 rue C', facturationCodePostal: '00001', facturationVille: 'Ailleurs',
    iban: 'FR76 3000 6000 0112 3456 7890 189', delaiPaiementJours: '45', penalitesRetard: 'Pénalités légales',
  };

  it('les champs sont persistés et relus correctement (IBAN normalisé par la base)', async () => {
    const a = await pro();
    const { data, error } = await enregistrerComme(a.client, a.id, complet);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // Relecture indépendante, avec la requête de l'écran.
    const { data: relu } = await a.client.from('praticiens').select(SELECT_PROFIL_FACTURATION).eq('id', a.id).maybeSingle();
    expect(lireFormulaire(relu as unknown as Record<string, unknown>)).toEqual({ ...complet, iban: 'FR7630006000011234567890189' });
    // Et directement en base, sans PostgREST.
    const ligne = await pg(c => c.query(`SELECT regime_tva, taux_tva::float8 AS taux, agrement_sap, iban, delai_paiement_jours, facturation_ville FROM public.praticiens WHERE id = $1`, [a.id]));
    expect(ligne.rows[0]).toEqual({ regime_tva: 'assujetti', taux: 5.5, agrement_sap: true, iban: 'FR7630006000011234567890189', delai_paiement_jours: 45, facturation_ville: 'Ailleurs' });
  });

  it('n\'écrit que la facturation : l\'identité (SIRET, nom, adresse professionnelle) reste intacte', async () => {
    const a = await pro();
    const avant = await pg(c => c.query(`SELECT nom, siret, numero_sap, adresse_rue, adresse_ville FROM public.praticiens WHERE id = $1`, [a.id]));
    await enregistrerComme(a.client, a.id, complet);
    const apres = await pg(c => c.query(`SELECT nom, siret, numero_sap, adresse_rue, adresse_ville FROM public.praticiens WHERE id = $1`, [a.id]));
    expect(apres.rows[0]).toEqual(avant.rows[0]);
  });

  it('vider un champ le remet à NULL et repasse le formulaire à vide', async () => {
    const a = await pro();
    await enregistrerComme(a.client, a.id, complet);
    const { data } = await enregistrerComme(a.client, a.id, { ...FORMULAIRE_VIDE });
    expect(lireFormulaire(data![0] as unknown as Record<string, unknown>)).toEqual(FORMULAIRE_VIDE);
    const l = await pg(c => c.query(`SELECT regime_tva, taux_tva, iban, facturation_adresse_rue, penalites_retard FROM public.praticiens WHERE id = $1`, [a.id]));
    expect(l.rows[0]).toEqual({ regime_tva: null, taux_tva: null, iban: null, facturation_adresse_rue: null, penalites_retard: null });
  });

  it('RLS en lecture : un praticien ne lit pas le profil d\'un autre', async () => {
    const a = await pro();
    const b = await pro();
    await enregistrerComme(a.client, a.id, complet);

    // La ligne d'un autre est invisible (aucune erreur, aucune donnée).
    const lecture = await b.client.from('praticiens').select(SELECT_PROFIL_FACTURATION).eq('id', a.id);
    expect(lecture.error).toBeNull();
    expect(lecture.data).toEqual([]);
    const toutes = await b.client.from('praticiens').select('id');
    expect((toutes.data ?? []).map(r => r.id)).toEqual([b.id]);

    // Un visiteur sans session ne lit rien.
    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
    const vu = await anonyme.from('praticiens').select(SELECT_PROFIL_FACTURATION).eq('id', a.id);
    expect(vu.data ?? []).toEqual([]);
  });

  it('RLS en écriture : un praticien ne modifie pas le profil d\'un autre', async () => {
    const a = await pro();
    const b = await pro();
    await enregistrerComme(a.client, a.id, complet);

    // Aucune ligne touchée, et la base n'a pas bougé. (Défense double : la policy UPDATE, et la
    // policy SELECT qui borne les lignes qu'un UPDATE ... WHERE peut atteindre.)
    // Modification VALIDE en soi (aucune contrainte de la base ne la refuserait) : seule la RLS peut
    // l'empêcher. Un essai que la contrainte de TVA refuserait prouverait autre chose.
    const ecriture = await b.client.from('praticiens').update({ penalites_retard: 'PIRATE', delai_paiement_jours: 0 }).eq('id', a.id).select('id');
    expect(ecriture.error).toBeNull();
    expect(ecriture.data ?? []).toEqual([]);
    const l = await pg(c => c.query(`SELECT penalites_retard, delai_paiement_jours FROM public.praticiens WHERE id = $1`, [a.id]));
    expect(l.rows[0]).toEqual({ penalites_retard: 'Pénalités légales', delai_paiement_jours: 45 });
    // Même chose sans session.
    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
    const sans = await anonyme.from('praticiens').update({ penalites_retard: 'PIRATE' }).eq('id', a.id).select('id');
    expect(sans.data ?? []).toEqual([]);
    expect((await pg(c => c.query(`SELECT penalites_retard FROM public.praticiens WHERE id = $1`, [a.id]))).rows[0].penalites_retard).toBe('Pénalités légales');
  });

  describe('contraintes de TVA de la base', () => {
    const cas: { nom: string; f: Partial<FormulaireFacturation>; accepte: boolean }[] = [
      { nom: 'franchise sans taux', f: { regimeTva: 'franchise_293B' }, accepte: true },
      { nom: 'assujetti à 10 %', f: { regimeTva: 'assujetti', tauxTva: '10' }, accepte: true },
      { nom: 'assujetti à 5,5 % AVEC agrément', f: { regimeTva: 'assujetti', tauxTva: '5.5', agrementSap: true }, accepte: true },
      { nom: 'assujetti à 5,5 % SANS agrément', f: { regimeTva: 'assujetti', tauxTva: '5.5', agrementSap: false }, accepte: false },
      { nom: 'assujetti sans taux', f: { regimeTva: 'assujetti', tauxTva: '' }, accepte: false },
      { nom: 'assujetti à un taux hors 5,5 / 10 (7 %)', f: { regimeTva: 'assujetti', tauxTva: '7' }, accepte: false },
      { nom: 'assujetti à 0 %', f: { regimeTva: 'assujetti', tauxTva: '0' }, accepte: false },
      { nom: 'assujetti à 20 %', f: { regimeTva: 'assujetti', tauxTva: '20', agrementSap: true }, accepte: false },
    ];

    for (const c of cas) {
      it(`${c.accepte ? 'accepte' : 'refuse'} : ${c.nom} (base ET interface d'accord)`, async () => {
        const a = await pro();
        const f = { ...FORMULAIRE_VIDE, ...c.f };
        // L'interface se prononce AVANT l'envoi…
        expect(Object.keys(validerFormulaire(f)).length === 0, 'interface').toBe(c.accepte);
        // …et la base, sur la valeur BRUTE saisie (le formulaire ne l'enverrait pas si l'interface refuse).
        const brut = { regime_tva: f.regimeTva || null, taux_tva: f.tauxTva ? Number(f.tauxTva) : null, agrement_sap: f.agrementSap };
        const { error, data } = await a.client.from('praticiens').update(brut).eq('id', a.id).select('id');
        if (c.accepte) { expect(error).toBeNull(); expect(data).toHaveLength(1); }
        else { expect(error?.message).toMatch(/praticiens_taux_tva_coherent/); }
      });
    }

    it('retirer l\'agrément alors que 5,5 % est enregistré est refusé en base', async () => {
      const a = await pro();
      await a.client.from('praticiens').update({ regime_tva: 'assujetti', taux_tva: 5.5, agrement_sap: true }).eq('id', a.id);
      const { error } = await a.client.from('praticiens').update({ agrement_sap: false }).eq('id', a.id);
      expect(error?.message).toMatch(/praticiens_taux_tva_coherent/);
    });

    it('une franchise n\'a pas de taux : 5,5 % ou 10 % y sont refusés par la base', async () => {
      const a = await pro();
      const { error } = await a.client.from('praticiens').update({ regime_tva: 'franchise_293B', taux_tva: 10 }).eq('id', a.id);
      expect(error?.message).toMatch(/praticiens_taux_tva_coherent/);
      // Ce que le formulaire envoie pour une franchise ne porte jamais de taux, même si un taux traînait.
      const { error: ok } = await enregistrerComme(a.client, a.id, { ...FORMULAIRE_VIDE, regimeTva: 'franchise_293B', tauxTva: '10' });
      expect(ok).toBeNull();
    });

    it('IBAN et délai : l\'interface et la base refusent les mêmes valeurs', async () => {
      const a = await pro();
      for (const iban of ['pas un iban', 'FR76', '12345678901234']) {
        expect(validerFormulaire({ ...FORMULAIRE_VIDE, iban }).iban, iban).toBeDefined();
        expect((await a.client.from('praticiens').update({ iban }).eq('id', a.id)).error?.message, iban).toMatch(/praticiens_iban_format/);
      }
      for (const delai of ['61', '-1']) {
        expect(validerFormulaire({ ...FORMULAIRE_VIDE, delaiPaiementJours: delai }).delaiPaiementJours, delai).toBeDefined();
        expect((await a.client.from('praticiens').update({ delai_paiement_jours: Number(delai) }).eq('id', a.id)).error?.message, delai).toMatch(/praticiens_delai_paiement_valide/);
      }
      for (const iban of ['FR76 3000 6000 0112 3456 7890 189', 'de89 3704 0044 0532 0130 00']) {
        expect(validerFormulaire({ ...FORMULAIRE_VIDE, iban }).iban, iban).toBeUndefined();
        expect((await enregistrerComme(a.client, a.id, { ...FORMULAIRE_VIDE, iban })).error, iban).toBeNull();
      }
    });
  });

  describe('bout en bout : le profil conditionne la validation d\'une facture', () => {
    /** Un praticien avec UN brouillon généré par le cron pour un mois à lui. */
    async function avecBrouillon() {
      const mois = moisDuTest();
      const a = await pro();
      const c = await creerContrat(a, mois, { seances: [{ jour: 3 }, { jour: 10 }] });
      await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
      const f = (await lignesDe(c.contratId, mois.periode)).factures[0];
      return { a, mois, factureId: f.id, contratId: c.contratId };
    }
    const profilLu = async (a: Awaited<ReturnType<typeof pro>>) => {
      const { data } = await a.client.from('praticiens').select(SELECT_PROFIL).eq('id', a.id).maybeSingle();
      return lireProfil(data as unknown as Record<string, unknown>);
    };
    const identiteLue = async (a: Awaited<ReturnType<typeof pro>>) => {
      const { data } = await a.client.from('praticiens').select(SELECT_PROFIL_FACTURATION).eq('id', a.id).maybeSingle();
      return lireIdentite(data as unknown as Record<string, unknown>);
    };

    it('profil incomplet : la validation est refusée avec le message exact, et l\'interface l\'avait prévu', async () => {
      const { a, factureId } = await avecBrouillon();
      const r = await a.client.rpc('valider_facture', { p_facture_id: factureId });
      expect(r.error?.message).toBe('Profil de facturation incomplet : siret, regime_tva');
      // L'interface annonçait déjà les mêmes manques AVANT le clic, avec le même vocabulaire.
      expect(profilFacturationManquant(await profilLu(a))).toEqual(['SIRET', 'régime de TVA']);
      expect(champsManquantsPourValider(await identiteLue(a), FORMULAIRE_VIDE).map(m => m.libelle)).toEqual(['SIRET (dans Paramètres)', 'Régime de TVA']);
    });

    it('le formulaire ne supprime que ce qu\'il renseigne : le message suit chaque manque, un à un', async () => {
      const { a, factureId } = await avecBrouillon();
      // 1) Régime choisi via le formulaire, SIRET toujours absent (il se saisit dans Paramètres).
      await enregistrerComme(a.client, a.id, { ...FORMULAIRE_VIDE, regimeTva: 'franchise_293B' });
      expect((await a.client.rpc('valider_facture', { p_facture_id: factureId })).error?.message).toBe('Profil de facturation incomplet : siret');
      expect(profilFacturationManquant(await profilLu(a))).toEqual(['SIRET']);
      // 2) SIRET saisi (écran Paramètres), régime retiré : seul le régime manque.
      await a.client.from('praticiens').update({ siret: '73282932000074' }).eq('id', a.id);
      await enregistrerComme(a.client, a.id, FORMULAIRE_VIDE);
      expect((await a.client.rpc('valider_facture', { p_facture_id: factureId })).error?.message).toBe('Profil de facturation incomplet : regime_tva');
      expect(profilFacturationManquant(await profilLu(a))).toEqual(['régime de TVA']);
    });

    it('profil complété par le formulaire : la facture est validée, numérotée, sans message d\'erreur', async () => {
      const { a, factureId, mois, contratId } = await avecBrouillon();
      await a.client.from('praticiens').update({ siret: '73282932000074' }).eq('id', a.id);   // Paramètres
      const { error } = await enregistrerComme(a.client, a.id, { ...FORMULAIRE_VIDE, regimeTva: 'assujetti', tauxTva: '10', iban: 'FR76 3000 6000 0112 3456 7890 189', delaiPaiementJours: '15' });
      expect(error).toBeNull();
      expect(champsManquantsPourValider(await identiteLue(a), lireFormulaire((await a.client.from('praticiens').select(SELECT_PROFIL_FACTURATION).eq('id', a.id).maybeSingle()).data as never))).toEqual([]);

      const r = await a.client.rpc('valider_facture', { p_facture_id: factureId });
      expect(r.error).toBeNull();
      expect(String(r.data)).toMatch(/^\d{4}-0001$/);
      const f = (await lignesDe(contratId, mois.periode)).factures[0];
      expect(f).toMatchObject({ statut: 'validee', numero: r.data, ht: 90, total: 99 });   // 90 € HT + 10 % de TVA
      // Les conditions de paiement du profil sont figées sur la facture : échéance = émission + 15 jours.
      const e = await pg(c => c.query(`SELECT (echeance - date_emission) AS jours FROM public.factures WHERE id = $1`, [factureId]));
      expect(e.rows[0].jours).toBe(15);
    });

    it('adresse de facturation : vide ("") masque l\'adresse du profil côté serveur, NULL non (l\'interface enregistre NULL)', async () => {
      const { a, factureId } = await avecBrouillon();
      await a.client.from('praticiens').update({ siret: '73282932000074', regime_tva: 'franchise_293B' }).eq('id', a.id);
      // Chaîne vide : refus « adresse », et l'interface (profilFacturationManquant) le prédit à l'identique.
      await a.client.from('praticiens').update({ facturation_adresse_rue: '' }).eq('id', a.id);
      expect(profilFacturationManquant(await profilLu(a))).toEqual(['adresse']);
      expect((await a.client.rpc('valider_facture', { p_facture_id: factureId })).error?.message).toBe('Profil de facturation incomplet : adresse');
      // Ce que le formulaire enregistre pour un champ vide : NULL, l'adresse professionnelle prend le relais.
      await enregistrerComme(a.client, a.id, { ...FORMULAIRE_VIDE, regimeTva: 'franchise_293B' });
      expect(profilFacturationManquant(await profilLu(a))).toEqual([]);
      expect((await a.client.rpc('valider_facture', { p_facture_id: factureId })).error).toBeNull();
    });
  });
});
