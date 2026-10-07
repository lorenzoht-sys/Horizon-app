// tests/db/facturation-pdf.spec.ts
//
// Étape 5 (PR A) contre une VRAIE pile Supabase locale : stockage privé des PDF de facture et trigger
// de génération. Migration 20261010100000.
//   - le bucket `factures` est privé et borné au PDF ;
//   - lecture : un praticien lit ses PDF, pas ceux d'un autre ; l'admin lit tout ; anon rien ;
//   - écriture : aucun client (même propriétaire) ne crée, ne remplace ni ne supprime un PDF ; seul
//     service_role (l'Edge Function) écrit ;
//   - la validation d'une facture n'échoue JAMAIS à cause du déclenchement du PDF, que Vault soit
//     vide, rempli, ou rempli avec une URL inutilisable.
// L'appel HTTP réel vers l'Edge Function n'est pas testé ici (il demande la pile de fonctions) :
// il l'est par le spike et la recette sur staging.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

const PDF = new Blob(['%PDF-1.7\n%test\n'], { type: 'application/pdf' });
const SECRETS_VAULT = ['facturation_pdf_url', 'facturation_webhook_secret'];

decrire('Facturation 5A : PDF, stockage privé et déclenchement', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);
  const fichiersCrees: string[] = [];
  const rolesCrees: string[] = [];

  afterAll(async () => {
    if (fichiersCrees.length) await serviceClient.storage.from('factures').remove(fichiersCrees);
    for (const id of rolesCrees) await pg(c => c.query(`DELETE FROM public.user_roles WHERE user_id = $1`, [id]));
    await pg(c => c.query(`DELETE FROM vault.secrets WHERE name = ANY($1)`, [SECRETS_VAULT]));
  });

  async function deposer(proprietaireId: string): Promise<string> {
    const chemin = `${proprietaireId}/${randomUUID().slice(0, 8)}.pdf`;
    const { error } = await serviceClient.storage.from('factures').upload(chemin, PDF, { contentType: 'application/pdf' });
    expect(error).toBeNull();
    fichiersCrees.push(chemin);
    return chemin;
  }

  it('le bucket est privé, limité au PDF et à 5 Mo', async () => {
    const r = await pg(c => c.query(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'factures'`));
    expect(r.rows).toEqual([{ public: false, file_size_limit: 5242880, allowed_mime_types: ['application/pdf'] }]);
  });

  it('un praticien lit ses PDF, pas ceux d\'un autre ; un visiteur sans session ne lit rien', async () => {
    const a = await pro();
    const b = await pro();
    const chemin = await deposer(a.id);

    const lectureA = await a.client.storage.from('factures').download(chemin);
    expect(lectureA.error).toBeNull();
    expect(lectureA.data?.size).toBe(PDF.size);

    expect((await b.client.storage.from('factures').download(chemin)).error).not.toBeNull();
    expect((await b.client.storage.from('factures').list(a.id)).data ?? []).toEqual([]);

    const anonyme = createClient(API_URL, anon, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
    expect((await anonyme.storage.from('factures').download(chemin)).error).not.toBeNull();
  });

  it('même le propriétaire ne peut ni créer, ni remplacer, ni supprimer un PDF', async () => {
    const a = await pro();
    const chemin = await deposer(a.id);
    const stock = a.client.storage.from('factures');

    const creation = await stock.upload(`${a.id}/pirate.pdf`, PDF, { contentType: 'application/pdf' });
    expect(creation.error).not.toBeNull();
    const remplacement = await stock.upload(chemin, new Blob(['%PDF-falsifié'], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
    expect(remplacement.error).not.toBeNull();
    await stock.remove([chemin]);

    // Le fichier est intact, octet pour octet.
    const { data } = await serviceClient.storage.from('factures').download(chemin);
    expect(await data!.text()).toBe(await PDF.text());
    expect((await serviceClient.storage.from('factures').list(a.id)).data?.some(o => o.name === 'pirate.pdf')).toBe(false);
  });

  it('un admin lit les PDF de tous, sans pouvoir écrire ; un praticien sans rôle admin non', async () => {
    const a = await pro();
    const admin = await pro();
    await pg(c => c.query(`INSERT INTO public.user_roles (user_id, app_role) VALUES ($1, 'admin')`, [admin.id]));
    rolesCrees.push(admin.id);
    const chemin = await deposer(a.id);

    expect((await admin.client.storage.from('factures').download(chemin)).error).toBeNull();
    expect((await admin.client.storage.from('factures').upload(`${a.id}/admin.pdf`, PDF, { contentType: 'application/pdf' })).error).not.toBeNull();
    await admin.client.storage.from('factures').remove([chemin]);
    expect((await serviceClient.storage.from('factures').download(chemin)).error).toBeNull();
  });

  it('un autre type de fichier est refusé par le bucket, même pour service_role', async () => {
    const a = await pro();
    const { error } = await serviceClient.storage.from('factures').upload(`${a.id}/texte.txt`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
  });

  describe('trigger de génération : la validation ne dépend jamais du PDF', () => {
    async function validerUneFacture() {
      const mois = moisDuTest();
      const a = await pro();
      const c = await creerContrat(a, mois, { seances: [{ jour: 3 }] });
      await genererBrouillonsDuMois(serviceClient, mois.periode, { envoyerAlerte: sansAlerte });
      const f = (await lignesDe(c.contratId, mois.periode)).factures[0];
      const r = await a.client.rpc('valider_facture', { p_facture_id: f.id });
      return { r, a, factureId: f.id };
    }
    const poserVault = (url: string, secret: string) => pg(async c => {
      await c.query(`DELETE FROM vault.secrets WHERE name = ANY($1)`, [SECRETS_VAULT]);
      await c.query(`SELECT vault.create_secret($1, 'facturation_pdf_url')`, [url]);
      await c.query(`SELECT vault.create_secret($1, 'facturation_webhook_secret')`, [secret]);
    });

    it('Vault vide : la facture est validée, pdf_path reste vide', async () => {
      await pg(c => c.query(`DELETE FROM vault.secrets WHERE name = ANY($1)`, [SECRETS_VAULT]));
      const { r, factureId } = await validerUneFacture();
      expect(r.error).toBeNull();
      const l = await pg(c => c.query(`SELECT statut, pdf_path FROM public.factures WHERE id = $1`, [factureId]));
      expect(l.rows[0]).toEqual({ statut: 'validee', pdf_path: null });
    });

    it('Vault rempli avec une URL inutilisable : la facture est validée quand même', async () => {
      await poserVault('pas une url', 'secret-de-test');
      const { r, factureId } = await validerUneFacture();
      expect(r.error).toBeNull();
      expect((await pg(c => c.query(`SELECT statut FROM public.factures WHERE id = $1`, [factureId]))).rows[0].statut).toBe('validee');
    });

    it('Vault rempli avec une URL joignable en principe : la facture est validée, pdf_path inchangé par le trigger', async () => {
      await poserVault('http://127.0.0.1:9/functions/v1/facturation-pdf', 'secret-de-test');
      const { r, factureId } = await validerUneFacture();
      expect(r.error).toBeNull();
      expect((await pg(c => c.query(`SELECT statut, pdf_path FROM public.factures WHERE id = $1`, [factureId]))).rows[0])
        .toEqual({ statut: 'validee', pdf_path: null });
    });

    it('la fonction de trigger n\'est exécutable ni par anon ni par authenticated', async () => {
      const r = await pg(c => c.query(
        `SELECT has_function_privilege('anon', 'public.declencher_pdf_facture()', 'EXECUTE') AS anon,
                has_function_privilege('authenticated', 'public.declencher_pdf_facture()', 'EXECUTE') AS auth`,
      ));
      expect(r.rows[0]).toEqual({ anon: false, auth: false });
    });
  });
});
