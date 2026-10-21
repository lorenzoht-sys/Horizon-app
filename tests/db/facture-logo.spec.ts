// tests/db/facture-logo.spec.ts
//
// Logo du praticien figé sur la facture (migration 20261023100000) contre une VRAIE pile Supabase locale :
// à la validation, le logo de Paramètres est copié dans logos_factures (clé = sha256 des octets) et sa clé
// rejoint snapshot_emetteur ; un logo changé ensuite ne touche pas une facture validée ; un logo absent ou
// illisible ne bloque jamais la validation ; la table n'est lisible que par service_role et inaltérable.
//
// ⚠️ BASE LOCALE UNIQUEMENT (voir fixtures-facturation.ts).
//   supabase start && supabase db reset && npm run test:db

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { genererBrouillonsDuMois } from '../../api/_lib/facturationMensuelle.js';
import { API_URL, clesLocales, creerContrat, creerPraticien, lignesDe, moisDuTest, pg, pileDisponible, sansAlerte, type Praticien } from './fixtures-facturation.js';

const DISPONIBLE = await pileDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

// Images de test (aucun logo réel) : PNG 1 × 1 rouge, et un second PNG 1 × 1 différent.
const PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha = (b64: string) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');

decrire('Logo du praticien figé sur la facture à sa validation', () => {
  const { service, anon } = clesLocales() ?? { service: 'absente', anon: 'absente' };
  const serviceClient = createClient(API_URL, service, { auth: { persistSession: false }, realtime: { transport: class {} as unknown as typeof WebSocket } });
  const pro = () => creerPraticien(serviceClient, anon, true);

  /** Logo posé comme le fait Paramètres : data URL dans praticiens.logo_praticien, avec le jeton du praticien. */
  const poserLogo = async (p: Praticien, valeur: string | null) =>
    expect((await p.client.from('praticiens').update({ logo_praticien: valeur }).eq('id', p.id)).error).toBeNull();
  /** Facture validée d'un nouveau contrat, avec le logo courant du praticien. */
  async function factureValidee(p: Praticien) {
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    const v = await p.client.rpc('valider_facture', { p_facture_id: f.id });
    expect(v.error).toBeNull();
    return f.id as string;
  }
  const snapshot = async (id: string) =>
    (await pg(c => c.query(`SELECT snapshot_emetteur AS s, statut FROM public.factures WHERE id = $1`, [id]))).rows[0];
  const logos = async (cle: string) =>
    (await pg(c => c.query(`SELECT type, translate(encode(octets, 'base64'), E'\\n', '') AS b64 FROM public.logos_factures WHERE sha256 = $1`, [cle]))).rows;

  it('PNG : la clé sha256 rejoint le snapshot, les octets exacts sont figés dans logos_factures', async () => {
    const p = await pro();
    await poserLogo(p, `data:image/png;base64,${PNG_A}`);
    const id = await factureValidee(p);
    const { s, statut } = await snapshot(id);
    expect(statut).toBe('validee');
    expect(s.logo_sha256).toBe(sha(PNG_A));
    expect(s.nom).toBeTruthy();   // le reste du snapshot de valider_facture() est intact
    expect(await logos(sha(PNG_A))).toEqual([{ type: 'png', b64: PNG_A }]);
  });

  it('le même logo sur deux factures : une seule image stockée ; changer le logo ne touche pas la facture validée', async () => {
    const p = await pro();
    await poserLogo(p, `data:image/png;base64,${PNG_B}`);
    const f1 = await factureValidee(p);
    const f2 = await factureValidee(p);
    expect((await snapshot(f1)).s.logo_sha256).toBe(sha(PNG_B));
    expect((await snapshot(f2)).s.logo_sha256).toBe(sha(PNG_B));
    expect(await logos(sha(PNG_B))).toHaveLength(1);

    await poserLogo(p, `data:image/png;base64,${PNG_A}`);
    const f3 = await factureValidee(p);
    expect((await snapshot(f1)).s.logo_sha256).toBe(sha(PNG_B));   // inchangée
    expect((await snapshot(f3)).s.logo_sha256).toBe(sha(PNG_A));
  });

  it('sans logo, ou logo illisible (SVG, base64 invalide, ni PNG ni JPEG) : facture validée, sans clé de logo', async () => {
    const p = await pro();
    for (const valeur of [null, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/png;base64,%%%pas-du-base64%%%', `data:image/png;base64,${Buffer.from('GIF89a…').toString('base64')}`]) {
      await poserLogo(p, valeur);
      const { s, statut } = await snapshot(await factureValidee(p));
      expect(statut).toBe('validee');
      expect(s).not.toHaveProperty('logo_sha256');
    }
  });

  it('le type vient des octets : un JPEG déclaré « png » est enregistré comme jpg', async () => {
    const p = await pro();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
    await poserLogo(p, `data:image/png;base64,${jpeg}`);
    const { s } = await snapshot(await factureValidee(p));
    expect((await logos(s.logo_sha256))[0].type).toBe('jpg');
  });

  it('logos_factures : invisible pour un praticien, lisible par service_role (bytea en hexadécimal), inaltérable', async () => {
    const p = await pro();
    await poserLogo(p, `data:image/png;base64,${PNG_A}`);
    await factureValidee(p);
    const lu = await p.client.from('logos_factures').select('sha256');
    expect(lu.error?.message ?? '').toMatch(/permission denied/);
    const ecrit = await p.client.from('logos_factures').insert({ sha256: sha(PNG_B), type: 'png', octets: '\\x00' });
    expect(ecrit.error?.message ?? '').toMatch(/permission denied/);

    // Exactement la lecture de l'Edge Function facturation-pdf.
    const r = await serviceClient.from('logos_factures').select('type, octets').eq('sha256', sha(PNG_A)).maybeSingle();
    expect(r.error).toBeNull();
    expect(String(r.data?.octets)).toBe('\\x' + Buffer.from(PNG_A, 'base64').toString('hex'));

    const refus = (sql: string) => pg(c => c.query(sql, [sha(PNG_A)]).then(() => null, (e: Error) => e.message));
    expect(await refus(`UPDATE public.logos_factures SET type = 'jpg' WHERE sha256 = $1`)).toMatch(/Logo figé/);
    expect(await refus(`DELETE FROM public.logos_factures WHERE sha256 = $1`)).toMatch(/Logo figé/);
  });

  it('ordre des déclencheurs : le logo est figé (BEFORE) avant tout déclencheur AFTER, y compris la demande de PDF', async () => {
    // Postgres exécute TOUS les déclencheurs BEFORE d'une ligne avant de l'écrire, puis les AFTER : l'ordre
    // alphabétique ne joue qu'à l'intérieur d'un même moment. factures_pdf_apres_validation est AFTER ;
    // factures_snapshot_logo est BEFORE et passe après factures_inalterables (ordre alphabétique).
    const moments = await pg(c => c.query(
      `SELECT tgname, (tgtype & 2) <> 0 AS before FROM pg_trigger
        WHERE tgrelid = 'public.factures'::regclass AND tgname IN ('factures_inalterables', 'factures_snapshot_logo', 'factures_pdf_apres_validation')
        ORDER BY tgname`));
    expect(moments.rows).toEqual([
      { tgname: 'factures_inalterables', before: true },
      { tgname: 'factures_pdf_apres_validation', before: false },
      { tgname: 'factures_snapshot_logo', before: true },
    ]);

    // Preuve par l'exécution : un déclencheur AFTER témoin, nommé pour passer AVANT tous les autres dans
    // l'ordre alphabétique, voit déjà la clé du logo dans la ligne validée. Transaction annulée ensuite.
    const p = await pro();
    await poserLogo(p, `data:image/png;base64,${PNG_A}`);
    const M = moisDuTest();
    const c = await creerContrat(p, M, { seances: [{ jour: 3 }] });
    await genererBrouillonsDuMois(serviceClient, M.periode, { envoyerAlerte: sansAlerte });
    const f = (await lignesDe(c.contratId, M.periode)).factures[0];
    const vu = await pg(async cl => {
      await cl.query('BEGIN');
      try {
        await cl.query(`CREATE TEMP TABLE temoin_logo (cle text) ON COMMIT DROP`);
        await cl.query(`CREATE FUNCTION pg_temp.temoin_logo() RETURNS trigger LANGUAGE plpgsql AS $$
                        BEGIN INSERT INTO temoin_logo VALUES (NEW.snapshot_emetteur ->> 'logo_sha256'); RETURN NULL; END; $$`);
        await cl.query(`CREATE TRIGGER aaa_temoin_logo AFTER UPDATE OF statut ON public.factures
                        FOR EACH ROW WHEN (OLD.statut = 'brouillon' AND NEW.statut = 'validee') EXECUTE FUNCTION pg_temp.temoin_logo()`);
        await cl.query(`SELECT public.valider_facture($1)`, [f.id]);
        return (await cl.query(`SELECT cle FROM temoin_logo`)).rows;
      } finally {
        await cl.query('ROLLBACK');
      }
    });
    expect(vu).toEqual([{ cle: sha(PNG_A) }]);
  });

  it('une facture validée reste inaltérable : la clé du logo ne peut pas être modifiée après coup', async () => {
    const p = await pro();
    await poserLogo(p, `data:image/png;base64,${PNG_A}`);
    const id = await factureValidee(p);
    const err = await pg(c => c.query(`UPDATE public.factures SET snapshot_emetteur = snapshot_emetteur || '{"logo_sha256":"x"}'::jsonb WHERE id = $1`, [id]).then(() => null, (e: Error) => e.message));
    expect(err).toMatch(/seuls statut et pdf_path peuvent changer/);
  });
});
