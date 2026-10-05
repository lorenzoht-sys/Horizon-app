// tests/db/facturation.spec.ts
//
// Tests de la base de facturation (étape 1) : numérotation, inaltérabilité, calcul
// du brouillon, unicité, RLS et contraintes de contrat/praticien. Ils s'exécutent
// contre une VRAIE base Postgres locale (supabase start + supabase db reset), parce
// que ce qu'on vérifie vit dans la base : triggers, verrous, RLS.
//
// ⚠️ BASE LOCALE UNIQUEMENT. Le fichier refuse toute cible qui n'est pas 127.0.0.1 /
// localhost (jamais staging, jamais la production). Sans base locale joignable, toute la
// suite est ignorée avec un message explicite, jamais un faux « vert ».
//
//   supabase start && supabase db reset
//   npm run test:db
//
// Chaque test tourne dans une transaction annulée à la fin, sauf le groupe
// « concurrence » : il lui faut des données validées par plusieurs connexions, donc
// commitées. Une facture validée est inaltérable (c'est tout l'objet de ces tests) et
// ne peut pas être nettoyée : ces données restent dans la base locale, sous un
// praticien neuf à chaque run. `supabase db reset` les efface.

import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, it, expect } from 'vitest';
import { trouverTarifApplicable, totalFactureSeance } from '../../src/lib/tarifsContrats';
import type { TarifContrat } from '../../src/types';

const DB_URL = process.env.FACTURATION_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const HOTE = new URL(DB_URL).hostname;
const EST_LOCAL = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(HOTE);

async function baseDisponible(): Promise<boolean> {
  if (!EST_LOCAL) {
    console.warn(`[tests/db] Hôte « ${HOTE} » refusé : ces tests ne tournent que sur une base locale.`);
    return false;
  }
  const c = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    const { rows } = await c.query(`SELECT to_regclass('public.factures') AS t, to_regproc('public.valider_facture') AS f`);
    return rows[0].t !== null && rows[0].f !== null;
  } catch {
    console.warn('[tests/db] Base locale injoignable ou sans migrations de facturation : suite ignorée (supabase start && supabase db reset).');
    return false;
  } finally {
    await c.end().catch(() => {});
  }
}

const DISPONIBLE = await baseDisponible();
const decrire = describe.skipIf(!DISPONIBLE);

// ───────────────────────────── utilitaires ─────────────────────────────

async function connecter(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

/** Exécute `fn` dans une transaction toujours annulée. */
async function transaction<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await connecter();
  try {
    await c.query('BEGIN');
    return await fn(c);
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end();
  }
}

type Ligne = Record<string, any>;
async function q(c: Client, sql: string, params: unknown[] = []): Promise<Ligne[]> {
  return (await c.query(sql, params)).rows;
}

/** Attend qu'une instruction soit refusée (sans abandonner la transaction). */
async function refus(c: Client, sql: string, params: unknown[], motif: RegExp | string): Promise<void> {
  await c.query('SAVEPOINT refus');
  let erreur: Error | undefined;
  try {
    await c.query(sql, params);
  } catch (e) {
    erreur = e as Error;
  }
  await c.query('ROLLBACK TO SAVEPOINT refus');
  await c.query('RELEASE SAVEPOINT refus');
  expect(erreur, `un refus était attendu pour : ${sql}`).toBeDefined();
  expect(erreur!.message).toMatch(motif);
}

async function commeUtilisateur(c: Client, id: string): Promise<void> {
  await c.query('SET LOCAL ROLE authenticated');
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: 'authenticated' })]);
}
async function commeAnon(c: Client): Promise<void> {
  await c.query('SET LOCAL ROLE anon');
  await c.query(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`);
}
async function commeAdmin(c: Client): Promise<string> {
  const id = await creerPraticien(c);
  await c.query(`UPDATE public.user_roles SET app_role = 'admin' WHERE user_id = $1`, [id]);
  return id;
}
async function retourPostgres(c: Client): Promise<void> {
  await c.query('RESET ROLE');
}

// ───────────────────────────── fixtures ─────────────────────────────

async function creerPraticien(c: Client, opts: { profilComplet?: boolean } = {}): Promise<string> {
  const complet = opts.profilComplet ?? true;
  const id = randomUUID();
  await c.query(
    `INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
    [id, `test-${id}@fact.test`],
  );
  await c.query(
    `INSERT INTO public.praticiens (id, nom, prenom, email, siret, adresse_rue, adresse_code_postal, adresse_ville, regime_tva, delai_paiement_jours, iban)
     VALUES ($1, 'PratTest', 'Alex', $2, $3, '1 rue Test', '00000', 'Villetest', $4, 30, 'FR7630006000011234567890189')`,
    [id, `test-${id}@fact.test`, complet ? '00000000000018' : null, complet ? 'franchise_293B' : null],
  );
  return id;
}

interface TarifFixture { debut: string; fin?: string | null; tarif: number; frais?: number }
interface ContratFixture { participantId: string; contratId: string; tarifIds: string[] }

async function creerContrat(
  c: Client,
  praticienId: string,
  opts: { mode?: 'seance' | 'forfait'; forfait?: number; tarifs?: TarifFixture[]; debut?: string; fin?: string } = {},
): Promise<ContratFixture> {
  const participantId = randomUUID();
  const contratId = randomUUID();
  await c.query(
    `INSERT INTO public.participants (id, praticien_id, nom, prenom, adresse_rue, adresse_code_postal, adresse_ville, rgpd)
     VALUES ($1, $2, 'BenefTest', 'Alice', '10 rue Test', '00000', 'Villetest', '{"consentementObtenu": true}'::jsonb)`,
    [participantId, praticienId],
  );
  await c.query(
    `INSERT INTO public.contrats (id, participant_id, praticien_id, date_debut, date_fin, duree_indeterminee, statut, jours_fixe, mode_facturation, montant_forfait)
     VALUES ($1, $2, $3, $4, $5, false, 'actif', ARRAY['lun'], $6, $7)`,
    [contratId, participantId, praticienId, opts.debut ?? '2026-01-01', opts.fin ?? '2026-12-31', opts.mode ?? 'seance', opts.forfait ?? null],
  );
  const tarifIds: string[] = [];
  const tarifs = opts.tarifs ?? (opts.mode === 'forfait' ? [] : [{ debut: '2026-01-01', tarif: 45 }]);
  for (const t of tarifs) {
    const id = randomUUID();
    await c.query(
      `INSERT INTO public.tarifs_contrats (id, contrat_id, tarif_seance, frais_deplacement, date_debut_validite, date_fin_validite)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, contratId, t.tarif, t.frais ?? 0, t.debut, t.fin ?? null],
    );
    tarifIds.push(id);
  }
  return { participantId, contratId, tarifIds };
}

async function creerSeance(
  c: Client, praticienId: string, ct: ContratFixture, date: string,
  statut: 'realisee' | 'annulee' | 'reportee' | 'planifiee' = 'realisee', heure = '10:00',
  type: 'seance' | 'bilan' | 'bilan_initial' = 'seance',
): Promise<string> {
  const id = randomUUID();
  await c.query(
    `INSERT INTO public.seances (id, participant_id, praticien_id, contrat_id, date, heure_debut, heure_fin, duree_minutes, type, statut)
     VALUES ($1, $2, $3, $4, $5, $6, '23:59', 45, $8, $7)`,
    [id, ct.participantId, praticienId, ct.contratId, date, heure, statut, type],
  );
  return id;
}

async function generer(c: Client, contratId: string, periode: string): Promise<string | null> {
  const [r] = await q(c, `SELECT public.generer_brouillon_facture($1, $2::date) AS id`, [contratId, periode]);
  return r.id;
}
async function valider(c: Client, factureId: string): Promise<string> {
  const [r] = await q(c, `SELECT public.valider_facture($1) AS numero`, [factureId]);
  return r.numero;
}
async function lignes(c: Client, factureId: string): Promise<Ligne[]> {
  return q(
    c,
    `SELECT l.libelle, l.montant::float8 AS montant, l.prix_unitaire::float8 AS prix, l.seance_id, l.tarif_contrat_id, s.date::text AS date
     FROM public.lignes_facture l LEFT JOIN public.seances s ON s.id = l.seance_id
     WHERE l.facture_id = $1 ORDER BY s.date NULLS LAST, l.created_at`,
    [factureId],
  );
}
async function anneeEmission(c: Client): Promise<number> {
  const [r] = await q(c, `SELECT extract(year FROM (now() AT TIME ZONE 'Europe/Paris'))::int AS a`);
  return r.a;
}

interface Validee { pro: string; ct: ContratFixture; seanceId: string; factureId: string; numero: string }
/** Praticien neuf + contrat à 45 € + une séance réalisée en mars 2026, facture générée puis validée. */
async function factureValidee(c: Client): Promise<Validee> {
  const pro = await creerPraticien(c);
  const ct = await creerContrat(c, pro);
  const seanceId = await creerSeance(c, pro, ct, '2026-03-10');
  const factureId = (await generer(c, ct.contratId, '2026-03-01'))!;
  const numero = await valider(c, factureId);
  return { pro, ct, seanceId, factureId, numero };
}

// ───────────────────────────── numérotation ─────────────────────────────

decrire('Numérotation (AAAA-NNNN, sans trou)', () => {
  it('attribue une séquence continue par praticien', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      const annee = await anneeEmission(c);
      const numeros: string[] = [];
      for (const [mois, date] of [['2026-01-01', '2026-01-12'], ['2026-02-01', '2026-02-09'], ['2026-03-01', '2026-03-09']]) {
        await creerSeance(c, pro, ct, date);
        numeros.push(await valider(c, (await generer(c, ct.contratId, mois))!));
      }
      expect(numeros).toEqual([`${annee}-0001`, `${annee}-0002`, `${annee}-0003`]);
    });
  });

  it('est indépendante d\'un praticien à l\'autre', async () => {
    await transaction(async c => {
      const annee = await anneeEmission(c);
      const a = await factureValidee(c);
      const b = await factureValidee(c);
      expect(a.numero).toBe(`${annee}-0001`);
      expect(b.numero).toBe(`${annee}-0001`);
    });
  });

  it('un brouillon supprimé ne consomme pas de numéro', async () => {
    await transaction(async c => {
      const annee = await anneeEmission(c);
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-01-12');
      const brouillon = (await generer(c, ct.contratId, '2026-01-01'))!;
      await c.query(`DELETE FROM public.factures WHERE id = $1`, [brouillon]);
      await creerSeance(c, pro, ct, '2026-02-09');
      const numero = await valider(c, (await generer(c, ct.contratId, '2026-02-01'))!);
      expect(numero).toBe(`${annee}-0001`);
      const [n] = await q(c, `SELECT count(*)::int AS n FROM public.compteurs_facture WHERE praticien_id = $1`, [pro]);
      expect(n.n).toBe(1);
    });
  });

  it('une validation annulée (rollback) libère son numéro : aucun trou', async () => {
    await transaction(async c => {
      const annee = await anneeEmission(c);
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-01-12');
      await creerSeance(c, pro, ct, '2026-02-09');
      const f1 = (await generer(c, ct.contratId, '2026-01-01'))!;
      const f2 = (await generer(c, ct.contratId, '2026-02-01'))!;
      expect(await valider(c, f1)).toBe(`${annee}-0001`);
      await c.query('SAVEPOINT validation');
      expect(await valider(c, f2)).toBe(`${annee}-0002`);
      await c.query('ROLLBACK TO SAVEPOINT validation');
      expect((await q(c, `SELECT statut FROM public.factures WHERE id = $1`, [f2]))[0].statut).toBe('brouillon');
      expect(await valider(c, f2)).toBe(`${annee}-0002`);
    });
  });

  it('refuse de valider deux fois, ou une facture sans ligne', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await refus(c, `SELECT public.valider_facture($1)`, [v.factureId], /déjà validée/);
      const vide = randomUUID();
      await c.query(
        `INSERT INTO public.factures (id, praticien_id, contrat_id, participant_id, periode) VALUES ($1, $2, $3, $4, '2026-05-01')`,
        [vide, v.pro, v.ct.contratId, v.ct.participantId],
      );
      await refus(c, `SELECT public.valider_facture($1)`, [vide], /aucune ligne/);
    });
  });

  it('refuse de valider si le profil du praticien est incomplet', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c, { profilComplet: false });
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-03-10');
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await refus(c, `SELECT public.valider_facture($1)`, [f], /Profil de facturation incomplet : siret, regime_tva/);
    });
  });

  it('fige l\'émetteur et le destinataire, l\'échéance et la répartition', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      const [f] = await q(c, `SELECT statut, total::float8 AS total, part_client::float8 AS part_client, part_urssaf::float8 AS part_urssaf,
        (echeance - date_emission) AS delai, snapshot_emetteur, snapshot_destinataire FROM public.factures WHERE id = $1`, [v.factureId]);
      expect(f.statut).toBe('validee');
      expect([f.total, f.part_client, f.part_urssaf]).toEqual([45, 45, 0]);
      expect(f.delai).toBe(30);
      expect(f.snapshot_emetteur).toMatchObject({ siret: '00000000000018', regime_tva: 'franchise_293B', iban: 'FR7630006000011234567890189' });
      expect(f.snapshot_destinataire).toMatchObject({ role: 'beneficiaire', nom: 'BenefTest' });
      // Le profil change ensuite : la facture émise ne bouge pas.
      await c.query(`UPDATE public.praticiens SET siret = '99999999999999' WHERE id = $1`, [v.pro]);
      const [apres] = await q(c, `SELECT snapshot_emetteur->>'siret' AS siret FROM public.factures WHERE id = $1`, [v.factureId]);
      expect(apres.siret).toBe('00000000000018');
    });
  });

  it('destinataire = le proche payeur quand le contrat en désigne un', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await c.query(
        `UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'Proche Test', payeur_adresse = '5 rue Proche, 00000 Villetest', payeur_email = 'proche@fact.test' WHERE id = $1`,
        [ct.contratId],
      );
      await creerSeance(c, pro, ct, '2026-03-10');
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await valider(c, f);
      const [r] = await q(c, `SELECT snapshot_destinataire AS d FROM public.factures WHERE id = $1`, [f]);
      expect(r.d).toMatchObject({ role: 'proche', nom: 'Proche Test', beneficiaire: { nom: 'BenefTest' } });
    });
  });
});

decrire('Numérotation : accès concurrents', () => {
  /** Praticien + n contrats ayant chacun un brouillon, le tout commité. */
  async function preparer(n: number): Promise<{ pro: string; brouillons: string[] }> {
    const c = await connecter();
    try {
      await c.query('BEGIN');
      const pro = await creerPraticien(c);
      const brouillons: string[] = [];
      for (let i = 0; i < n; i++) {
        const ct = await creerContrat(c, pro);
        await creerSeance(c, pro, ct, '2026-03-10');
        brouillons.push((await generer(c, ct.contratId, '2026-03-01'))!);
      }
      await c.query('COMMIT');
      return { pro, brouillons };
    } finally {
      await c.end();
    }
  }

  it('la seconde validation attend la première, puis prend le numéro suivant', async () => {
    const { pro, brouillons } = await preparer(2);
    const [c1, c2, lecteur] = [await connecter(), await connecter(), await connecter()];
    try {
      const annee = await anneeEmission(lecteur);
      await c1.query('BEGIN');
      const n1 = await valider(c1, brouillons[0]);          // verrou du compteur tenu, non commité
      await c2.query('BEGIN');
      const p2 = valider(c2, brouillons[1]);                 // doit attendre c1
      const etat = await Promise.race([
        p2.then(() => 'terminee'),
        new Promise<string>(r => setTimeout(() => r('bloquee'), 400)),
      ]);
      expect(etat).toBe('bloquee');
      await c1.query('COMMIT');
      const n2 = await p2;
      await c2.query('COMMIT');
      expect(n1).toBe(`${annee}-0001`);
      expect(n2).toBe(`${annee}-0002`);
      const [cpt] = await q(lecteur, `SELECT dernier_numero FROM public.compteurs_facture WHERE praticien_id = $1`, [pro]);
      expect(cpt.dernier_numero).toBe(2);
    } finally {
      await Promise.all([c1, c2, lecteur].map(c => c.end().catch(() => {})));
    }
  });

  it('cinq validations simultanées donnent cinq numéros distincts, 1 à 5, sans trou', async () => {
    const N = 5;
    const { pro, brouillons } = await preparer(N);
    const clients = await Promise.all(brouillons.map(() => connecter()));
    const lecteur = await connecter();
    try {
      const annee = await anneeEmission(lecteur);
      const numeros = await Promise.all(clients.map((c, i) => valider(c, brouillons[i])));
      const attendus = Array.from({ length: N }, (_, i) => `${annee}-${String(i + 1).padStart(4, '0')}`);
      expect([...numeros].sort()).toEqual(attendus);
      expect(new Set(numeros).size).toBe(N);
      const [cpt] = await q(lecteur, `SELECT dernier_numero FROM public.compteurs_facture WHERE praticien_id = $1`, [pro]);
      expect(cpt.dernier_numero).toBe(N);
    } finally {
      await Promise.all([...clients, lecteur].map(c => c.end().catch(() => {})));
    }
  });
});

// ───────────────────────────── inaltérabilité ─────────────────────────────

decrire('Inaltérabilité (triggers)', () => {
  it('une facture validée refuse toute modification hors statut et pdf_path', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      const motif = /validée : seuls statut et pdf_path/;
      await refus(c, `UPDATE public.factures SET total = total + 1, part_client = part_client + 1 WHERE id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.factures SET numero = '2026-9999' WHERE id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.factures SET periode = '2026-04-01' WHERE id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.factures SET date_emission = '2020-01-01' WHERE id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.factures SET snapshot_emetteur = '{}'::jsonb WHERE id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.factures SET snapshot_destinataire = '{}'::jsonb WHERE id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.factures SET circuit = 'urssaf' WHERE id = $1`, [v.factureId], motif);
    });
  });

  it('une facture validée ne se supprime pas et ne revient pas au brouillon', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await refus(c, `DELETE FROM public.factures WHERE id = $1`, [v.factureId], /non supprimable/);
      await refus(c, `UPDATE public.factures SET statut = 'brouillon', numero = NULL WHERE id = $1`, [v.factureId], /retour au brouillon interdit/);
    });
  });

  it('seuls statut et pdf_path peuvent évoluer, et un paiement peut s\'ajouter', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await c.query(`UPDATE public.factures SET statut = 'envoyee' WHERE id = $1`, [v.factureId]);
      await c.query(`UPDATE public.factures SET pdf_path = 'factures/test.pdf' WHERE id = $1`, [v.factureId]);
      await c.query(`INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, '2026-04-01', 45, 'virement')`, [v.factureId]);
      await c.query(`UPDATE public.factures SET statut = 'payee' WHERE id = $1`, [v.factureId]);
      const [f] = await q(c, `SELECT statut, pdf_path FROM public.factures WHERE id = $1`, [v.factureId]);
      expect(f).toEqual({ statut: 'payee', pdf_path: 'factures/test.pdf' });
    });
  });

  it('une facture ne se crée qu\'en brouillon et n\'en sort que par valider_facture()', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await refus(
        c,
        `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, statut, numero, date_emission, echeance, snapshot_emetteur, snapshot_destinataire)
         VALUES ($1, $2, $3, '2026-05-01', 'validee', '2026-0001', '2026-05-31', '2026-06-30', '{}', '{}')`,
        [pro, ct.contratId, ct.participantId], /se crée en brouillon/,
      );
      await creerSeance(c, pro, ct, '2026-03-10');
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      // UPDATE direct vers « validee » avec un faux numéro : contourne la numérotation.
      await refus(
        c,
        `UPDATE public.factures SET statut = 'validee', numero = '2026-0042', date_emission = '2026-03-31', echeance = '2026-04-30',
           snapshot_emetteur = '{}', snapshot_destinataire = '{}' WHERE id = $1`,
        [f], /réservée à valider_facture/,
      );
    });
  });

  it('une facture ne s\'annule pas par un simple UPDATE de statut', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await refus(c, `UPDATE public.factures SET statut = 'annulee' WHERE id = $1`, [v.factureId], /ne s'annule que par un avoir/);
    });
  });

  it('les lignes d\'une facture validée ne peuvent être ni ajoutées, ni modifiées, ni supprimées', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      const [l] = await lignes(c, v.factureId);
      const motif = /n'est plus un brouillon/;
      await refus(c, `INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Ajout', 1, 10, 10)`, [v.factureId], motif);
      await refus(c, `UPDATE public.lignes_facture SET libelle = 'Modifié' WHERE facture_id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.lignes_facture SET prix_unitaire = 1, montant = 1 WHERE facture_id = $1`, [v.factureId], motif);
      await refus(c, `DELETE FROM public.lignes_facture WHERE facture_id = $1`, [v.factureId], motif);
      expect(l.montant).toBe(45);
    });
  });

  it('un paiement est refusé sur un brouillon', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-03-10');
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await refus(c, `INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, '2026-04-01', 45, 'virement')`, [f], /Paiement refusé/);
    });
  });

  it('une séance facturée ne peut ni changer de facturation ni être supprimée', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      const motif = /déjà facturée/;
      await refus(c, `UPDATE public.seances SET date = '2026-03-11' WHERE id = $1`, [v.seanceId], motif);
      await refus(c, `UPDATE public.seances SET statut = 'annulee' WHERE id = $1`, [v.seanceId], motif);
      await refus(c, `UPDATE public.seances SET heure_debut = '11:00' WHERE id = $1`, [v.seanceId], motif);
      await refus(c, `UPDATE public.seances SET duree_minutes = 60 WHERE id = $1`, [v.seanceId], motif);
      await refus(c, `UPDATE public.seances SET contrat_id = NULL WHERE id = $1`, [v.seanceId], motif);
      await refus(c, `DELETE FROM public.seances WHERE id = $1`, [v.seanceId], motif);
    });
  });

  it('une séance facturée garde ses colonnes sans effet sur la facturation modifiables', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await c.query(`UPDATE public.seances SET notes = 'note de suivi', adresse = '3 rue Autre' WHERE id = $1`, [v.seanceId]);
      const [s] = await q(c, `SELECT notes, adresse FROM public.seances WHERE id = $1`, [v.seanceId]);
      expect(s).toEqual({ notes: 'note de suivi', adresse: '3 rue Autre' });
    });
  });

  it('une séance non facturée reste modifiable', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      const autre = await creerSeance(c, v.pro, v.ct, '2026-04-14');
      await c.query(`UPDATE public.seances SET date = '2026-04-15', statut = 'annulee' WHERE id = $1`, [autre]);
      await c.query(`DELETE FROM public.seances WHERE id = $1`, [autre]);
    });
  });

  it('une version de tarif utilisée refuse modification et suppression, mais peut être close', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      const tarifId = v.ct.tarifIds[0];
      const motifNouvelle = /créer une nouvelle version/;
      await refus(c, `UPDATE public.tarifs_contrats SET tarif_seance = 99 WHERE id = $1`, [tarifId], motifNouvelle);
      await refus(c, `UPDATE public.tarifs_contrats SET frais_deplacement = 5 WHERE id = $1`, [tarifId], motifNouvelle);
      await refus(c, `UPDATE public.tarifs_contrats SET date_debut_validite = '2026-03-10' WHERE id = $1`, [tarifId], motifNouvelle);
      await refus(c, `DELETE FROM public.tarifs_contrats WHERE id = $1`, [tarifId], /suppression interdite/);
      // Clôture avant la dernière séance facturée (10/03) : refusée.
      await refus(c, `UPDATE public.tarifs_contrats SET date_fin_validite = '2026-03-09' WHERE id = $1`, [tarifId], /seule sa clôture/);
      // Clôture après : permise (c'est le geste « nouvelle version » de l'application).
      await c.query(`UPDATE public.tarifs_contrats SET date_fin_validite = '2026-03-31' WHERE id = $1`, [tarifId]);
      await c.query(`INSERT INTO public.tarifs_contrats (contrat_id, tarif_seance, date_debut_validite) VALUES ($1, 50, '2026-04-01')`, [v.ct.contratId]);
      // Une version close ne se rouvre pas.
      await refus(c, `UPDATE public.tarifs_contrats SET date_fin_validite = NULL WHERE id = $1`, [tarifId], /seule sa clôture/);
    });
  });

  it('une version de tarif non utilisée reste modifiable', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await c.query(`UPDATE public.tarifs_contrats SET tarif_seance = 60 WHERE id = $1`, [ct.tarifIds[0]]);
      await c.query(`DELETE FROM public.tarifs_contrats WHERE id = $1`, [ct.tarifIds[0]]);
    });
  });

  it('un avoir total annule la facture d\'origine et libère ses séances et le mois', async () => {
    await transaction(async c => {
      const annee = await anneeEmission(c);
      const v = await factureValidee(c);
      const avoir = randomUUID();
      await c.query(
        `INSERT INTO public.factures (id, praticien_id, contrat_id, participant_id, periode, type, facture_origine_id)
         VALUES ($1, $2, $3, $4, '2026-03-01', 'avoir', $5)`,
        [avoir, v.pro, v.ct.contratId, v.ct.participantId, v.factureId],
      );
      await c.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Avoir séance du 10/03/2026', 1, 45, 45)`, [avoir]);
      expect(await valider(c, avoir)).toBe(`${annee}-0002`);
      const [o] = await q(c, `SELECT statut FROM public.factures WHERE id = $1`, [v.factureId]);
      expect(o.statut).toBe('annulee');
      // La séance n'est plus verrouillée et le mois peut être refacturé.
      await c.query(`UPDATE public.seances SET notes = 'rectifiée' WHERE id = $1`, [v.seanceId]);
      await c.query(`UPDATE public.seances SET date = '2026-03-12' WHERE id = $1`, [v.seanceId]);
      const nouvelle = await generer(c, v.ct.contratId, '2026-03-01');
      expect(nouvelle).not.toBeNull();
      expect(nouvelle).not.toBe(v.factureId);
      await refus(c, `UPDATE public.factures SET statut = 'validee' WHERE id = $1`, [v.factureId], /statut définitif/);
    });
  });

  it('un avoir ne peut porter que sur une facture émise, pour au plus son montant', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-03-10');
      const brouillon = (await generer(c, ct.contratId, '2026-03-01'))!;
      await refus(
        c,
        `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, type, facture_origine_id) VALUES ($1, $2, $3, '2026-03-01', 'avoir', $4)`,
        [pro, ct.contratId, ct.participantId, brouillon], /facture émise non annulée/,
      );
      await valider(c, brouillon);
      const avoir = randomUUID();
      await c.query(
        `INSERT INTO public.factures (id, praticien_id, contrat_id, participant_id, periode, type, facture_origine_id) VALUES ($1, $2, $3, $4, '2026-03-01', 'avoir', $5)`,
        [avoir, pro, ct.contratId, ct.participantId, brouillon],
      );
      await c.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Avoir', 1, 46, 46)`, [avoir]);
      await refus(c, `SELECT public.valider_facture($1)`, [avoir], /dépasse la facture d'origine/);
    });
  });
});

// ───────────────────────────── calcul ─────────────────────────────

decrire('Calcul du brouillon', () => {
  it('applique le tarif de chaque séance à sa date (changement de tarif en cours de mois)', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro, {
        tarifs: [
          { debut: '2026-01-01', fin: '2026-03-14', tarif: 45 },
          { debut: '2026-03-15', tarif: 50, frais: 5 },
        ],
      });
      const s1 = await creerSeance(c, pro, ct, '2026-03-10');
      const s2 = await creerSeance(c, pro, ct, '2026-03-14');
      const s3 = await creerSeance(c, pro, ct, '2026-03-15');
      const s4 = await creerSeance(c, pro, ct, '2026-03-24');
      const id = (await generer(c, ct.contratId, '2026-03-17'))!;   // n'importe quel jour du mois
      const ls = await lignes(c, id);
      expect(ls.map(l => [l.date, l.montant])).toEqual([
        ['2026-03-10', 45], ['2026-03-14', 45], ['2026-03-15', 55], ['2026-03-24', 55],
      ]);
      expect(ls.map(l => l.seance_id)).toEqual([s1, s2, s3, s4]);
      expect(ls[0].tarif_contrat_id).toBe(ct.tarifIds[0]);
      expect(ls[3].tarif_contrat_id).toBe(ct.tarifIds[1]);
      expect(ls[2].libelle).toContain('dont déplacement 5.00 €');
      const [f] = await q(c, `SELECT periode::text AS periode, total::float8 AS total, part_client::float8 AS part_client, part_urssaf::float8 AS part_urssaf, statut, numero, circuit FROM public.factures WHERE id = $1`, [id]);
      expect(f).toEqual({ periode: '2026-03-01', total: 200, part_client: 200, part_urssaf: 0, statut: 'brouillon', numero: null, circuit: 'classique' });
    });
  });

  it('donne le même résultat que le calcul TypeScript existant (tarifsContrats.ts)', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const tarifs: TarifFixture[] = [
        { debut: '2026-01-01', fin: '2026-03-09', tarif: 40, frais: 0 },
        { debut: '2026-03-10', fin: '2026-03-19', tarif: 45, frais: 2.5 },
        { debut: '2026-03-20', tarif: 52, frais: 0 },
      ];
      const ct = await creerContrat(c, pro, { tarifs });
      const dates = ['2026-03-02', '2026-03-10', '2026-03-19', '2026-03-20', '2026-03-31'];
      for (const d of dates) await creerSeance(c, pro, ct, d);
      const versions: TarifContrat[] = tarifs.map((t, i) => ({
        id: ct.tarifIds[i], contratId: ct.contratId, tarifSeance: t.tarif, fraisDeplacement: t.frais ?? 0,
        dateDebutValidite: t.debut, dateFinValidite: t.fin ?? undefined, createdAt: '',
      }));
      const attendu = dates.map(d => totalFactureSeance(trouverTarifApplicable(versions, d)!));
      const ls = await lignes(c, (await generer(c, ct.contratId, '2026-03-01'))!);
      expect(ls.map(l => l.montant)).toEqual(attendu);
    });
  });

  it('ne facture que les séances réalisées, du bon contrat et du bon mois', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      const autre = await creerContrat(c, pro);
      const realisee = await creerSeance(c, pro, ct, '2026-03-03', 'realisee');
      await creerSeance(c, pro, ct, '2026-03-05', 'annulee');
      await creerSeance(c, pro, ct, '2026-03-06', 'reportee');
      await creerSeance(c, pro, ct, '2026-03-07', 'planifiee');
      await creerSeance(c, pro, ct, '2026-02-28', 'realisee');   // mois précédent
      await creerSeance(c, pro, ct, '2026-04-01', 'realisee');   // mois suivant
      await creerSeance(c, pro, autre, '2026-03-04', 'realisee'); // autre contrat
      const ls = await lignes(c, (await generer(c, ct.contratId, '2026-03-01'))!);
      expect(ls.map(l => l.seance_id)).toEqual([realisee]);
      expect(ls[0].montant).toBe(45);
    });
  });

  it('ne produit aucun brouillon quand rien n\'est à facturer', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-03-05', 'annulee');
      expect(await generer(c, ct.contratId, '2026-03-01')).toBeNull();
      const [n] = await q(c, `SELECT count(*)::int AS n FROM public.factures WHERE contrat_id = $1`, [ct.contratId]);
      expect(n.n).toBe(0);
    });
  });

  it('échoue, sans repli silencieux, si une séance n\'a aucun tarif applicable', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro, { tarifs: [{ debut: '2026-03-15', tarif: 50 }] });
      await creerSeance(c, pro, ct, '2026-03-10');
      await refus(c, `SELECT public.generer_brouillon_facture($1, '2026-03-01')`, [ct.contratId], /Aucun tarif applicable pour la ou les séances du 10\/03\/2026/);
    });
  });

  it('mode forfait : une ligne au montant du forfait, séances ignorées', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro, { mode: 'forfait', forfait: 120 });
      await creerSeance(c, pro, ct, '2026-03-03');
      await creerSeance(c, pro, ct, '2026-03-10');
      const id = (await generer(c, ct.contratId, '2026-03-01'))!;
      const ls = await lignes(c, id);
      expect(ls).toHaveLength(1);
      expect(ls[0]).toMatchObject({ montant: 120, prix: 120, seance_id: null, tarif_contrat_id: null });
      expect(ls[0].libelle).toBe('Forfait mensuel — mars 2026');
      const [f] = await q(c, `SELECT total::float8 AS total FROM public.factures WHERE id = $1`, [id]);
      expect(f.total).toBe(120);
    });
  });

  it('mode forfait : refusé hors de la période du contrat', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro, { mode: 'forfait', forfait: 120, debut: '2026-01-01', fin: '2026-02-28' });
      await refus(c, `SELECT public.generer_brouillon_facture($1, '2026-03-01')`, [ct.contratId], /ne couvre pas la période 03\/2026/);
    });
  });

  it('est idempotent : relancée, elle ne crée pas de doublon et recalcule le brouillon', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-03-03');
      const id1 = (await generer(c, ct.contratId, '2026-03-01'))!;
      const avant = await lignes(c, id1);
      const id2 = (await generer(c, ct.contratId, '2026-03-20'))!;
      expect(id2).toBe(id1);
      expect(await lignes(c, id2)).toEqual(avant);
      const [n] = await q(c, `SELECT count(*)::int AS n FROM public.factures WHERE contrat_id = $1`, [ct.contratId]);
      expect(n.n).toBe(1);

      // Une séance de plus : même brouillon, deux lignes, total à jour.
      await creerSeance(c, pro, ct, '2026-03-17');
      expect(await generer(c, ct.contratId, '2026-03-01')).toBe(id1);
      expect(await lignes(c, id1)).toHaveLength(2);
      const [f] = await q(c, `SELECT total::float8 AS total FROM public.factures WHERE id = $1`, [id1]);
      expect(f.total).toBe(90);
    });
  });

  it('est idempotente aussi après validation : renvoie la facture émise, intacte', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await creerSeance(c, v.pro, v.ct, '2026-03-24');   // séance réalisée après coup
      expect(await generer(c, v.ct.contratId, '2026-03-01')).toBe(v.factureId);
      expect(await lignes(c, v.factureId)).toHaveLength(1);
      const [f] = await q(c, `SELECT statut, numero, total::float8 AS total FROM public.factures WHERE id = $1`, [v.factureId]);
      expect(f).toEqual({ statut: 'validee', numero: v.numero, total: 45 });
    });
  });

  it('ne refacture pas une séance déjà portée par une autre facture', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      // Le mois suivant n'a aucune séance : rien à facturer, et la séance de mars n'est pas reprise.
      expect(await generer(c, v.ct.contratId, '2026-04-01')).toBeNull();
      const [n] = await q(c, `SELECT count(*)::int AS n FROM public.lignes_facture WHERE seance_id = $1`, [v.seanceId]);
      expect(n.n).toBe(1);
    });
  });

  it('supprime le brouillon devenu vide au lieu de le laisser sans ligne', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      const s = await creerSeance(c, pro, ct, '2026-03-03');
      const id = (await generer(c, ct.contratId, '2026-03-01'))!;
      await c.query(`UPDATE public.seances SET statut = 'annulee' WHERE id = $1`, [s]);
      expect(await generer(c, ct.contratId, '2026-03-01')).toBeNull();
      expect((await q(c, `SELECT 1 FROM public.factures WHERE id = $1`, [id]))).toHaveLength(0);
    });
  });
});

// ───────────────────────────── unicité ─────────────────────────────

decrire('Unicité contrat / période', () => {
  const insererBrouillon = `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode) VALUES ($1, $2, $3, $4)`;

  it('refuse un second brouillon pour le même contrat et le même mois', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await c.query(insererBrouillon, [pro, ct.contratId, ct.participantId, '2026-03-01']);
      await refus(c, insererBrouillon, [pro, ct.contratId, ct.participantId, '2026-03-01'], /factures_une_vivante_par_contrat_periode/);
      await c.query(insererBrouillon, [pro, ct.contratId, ct.participantId, '2026-04-01']);   // autre mois : ok
    });
  });

  it('refuse un brouillon quand une facture émise existe déjà pour ce mois', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await refus(c, insererBrouillon, [v.pro, v.ct.contratId, v.ct.participantId, '2026-03-01'], /factures_une_vivante_par_contrat_periode/);
    });
  });

  it('exige un premier du mois, des montants cohérents et un numéro bien formé', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await refus(c, insererBrouillon, [pro, ct.contratId, ct.participantId, '2026-03-15'], /factures_periode_premier_du_mois/);
      await refus(c, `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, total, part_client) VALUES ($1, $2, $3, '2026-03-01', 50, 10)`,
        [pro, ct.contratId, ct.participantId], /factures_repartition_coherente/);
      await refus(c, `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, numero) VALUES ($1, $2, $3, '2026-03-01', '2026-1')`,
        [pro, ct.contratId, ct.participantId], /factures_numero_format|factures_etat_emission/);
    });
  });

  it('refuse la suppression d\'un contrat ou d\'un bénéficiaire qui a des factures', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      // Deux protections se complètent : la clé étrangère RESTRICT de factures et le verrou des
      // séances facturées (l'action SET NULL / CASCADE passerait par un UPDATE ou DELETE de séance).
      const motif = /foreign key|viole|violates|déjà facturée/i;
      await refus(c, `DELETE FROM public.contrats WHERE id = $1`, [v.ct.contratId], motif);
      await refus(c, `DELETE FROM public.participants WHERE id = $1`, [v.ct.participantId], motif);
    });
  });
});

// ───────────────────────────── RLS ─────────────────────────────

decrire('RLS : un praticien ne voit et ne gère que ses factures ; l\'admin lit tout', () => {
  it('cloisonne les factures, lignes et paiements entre praticiens', async () => {
    await transaction(async c => {
      const a = await factureValidee(c);
      const b = await factureValidee(c);
      await c.query(`INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, '2026-04-01', 45, 'virement')`, [a.factureId]);

      await commeUtilisateur(c, a.pro);
      expect((await q(c, `SELECT id FROM public.factures`)).map(r => r.id)).toEqual([a.factureId]);
      expect(await q(c, `SELECT 1 FROM public.lignes_facture`)).toHaveLength(1);
      expect(await q(c, `SELECT 1 FROM public.paiements`)).toHaveLength(1);
      // Lire ou modifier la facture d'un autre : zéro ligne.
      expect(await q(c, `SELECT 1 FROM public.factures WHERE id = $1`, [b.factureId])).toHaveLength(0);
      expect((await c.query(`UPDATE public.factures SET statut = 'envoyee' WHERE id = $1`, [b.factureId])).rowCount).toBe(0);
      // Insérer pour le compte d'un autre praticien, ou sur le contrat d'un autre : refusé.
      await refus(c, `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode) VALUES ($1, $2, $3, '2026-07-01')`,
        [b.pro, b.ct.contratId, b.ct.participantId], /row-level security/);
      await refus(c, `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode) VALUES ($1, $2, $3, '2026-07-01')`,
        [a.pro, b.ct.contratId, b.ct.participantId], /row-level security/);
      await refus(c, `INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, '2026-04-01', 45, 'virement')`, [b.factureId], /row-level security/);
      // La numérotation n'est pas accessible directement.
      await refus(c, `SELECT * FROM public.compteurs_facture`, [], /permission denied/);
      await refus(c, `SELECT public.attribuer_numero_facture($1, 2026)`, [a.pro], /permission denied/);
    });
  });

  it('un praticien génère et valide pour ses contrats, pas pour ceux d\'un autre', async () => {
    await transaction(async c => {
      const a = await creerPraticien(c);
      const b = await creerPraticien(c);
      const ctA = await creerContrat(c, a);
      const ctB = await creerContrat(c, b);
      await creerSeance(c, a, ctA, '2026-03-10');
      await creerSeance(c, b, ctB, '2026-03-10');

      await commeUtilisateur(c, a);
      const f = await generer(c, ctA.contratId, '2026-03-01');
      expect(f).not.toBeNull();
      await refus(c, `SELECT public.generer_brouillon_facture($1, '2026-03-01')`, [ctB.contratId], /Contrat introuvable/);
      expect(await valider(c, f!)).toMatch(/^\d{4}-0001$/);

      await retourPostgres(c);
      const fB = (await generer(c, ctB.contratId, '2026-03-01'))!;
      await commeUtilisateur(c, a);
      await refus(c, `SELECT public.valider_facture($1)`, [fB], /Facture introuvable|Accès refusé/);
    });
  });

  it('l\'admin lit toutes les factures mais n\'écrit pas', async () => {
    await transaction(async c => {
      const a = await factureValidee(c);
      const b = await factureValidee(c);
      const admin = await commeAdmin(c);
      await commeUtilisateur(c, admin);
      const ids = (await q(c, `SELECT id FROM public.factures WHERE id = ANY($1)`, [[a.factureId, b.factureId]])).map(r => r.id);
      expect(ids.sort()).toEqual([a.factureId, b.factureId].sort());
      expect((await q(c, `SELECT 1 FROM public.lignes_facture WHERE facture_id = ANY($1)`, [[a.factureId, b.factureId]])).length).toBe(2);
      expect((await c.query(`UPDATE public.factures SET statut = 'envoyee' WHERE id = $1`, [a.factureId])).rowCount).toBe(0);
      expect((await c.query(`DELETE FROM public.lignes_facture WHERE facture_id = $1`, [a.factureId])).rowCount).toBe(0);
      await refus(c, `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode) VALUES ($1, $2, $3, '2026-07-01')`,
        [admin, a.ct.contratId, a.ct.participantId], /row-level security/);
    });
  });

  it('anon n\'a accès à rien', async () => {
    await transaction(async c => {
      await factureValidee(c);
      await commeAnon(c);
      for (const t of ['factures', 'lignes_facture', 'paiements', 'compteurs_facture']) {
        await refus(c, `SELECT * FROM public.${t}`, [], /permission denied/);
      }
      await refus(c, `SELECT public.valider_facture(gen_random_uuid())`, [], /permission denied/);
      await refus(c, `SELECT public.generer_brouillon_facture(gen_random_uuid(), '2026-03-01')`, [], /permission denied/);
    });
  });
});

// ───────────────────────────── contrats et praticiens ─────────────────────────────

decrire('Contrats : mode de facturation et payeur', () => {
  it('un contrat existant reste « à la séance, payé par le bénéficiaire »', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      const [r] = await q(c, `SELECT mode_facturation, montant_forfait, payeur_type, payeur_nom FROM public.contrats WHERE id = $1`, [ct.contratId]);
      expect(r).toEqual({ mode_facturation: 'seance', montant_forfait: null, payeur_type: 'beneficiaire', payeur_nom: null });
    });
  });

  it('exige un montant en mode forfait, et un montant positif', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await refus(c, `UPDATE public.contrats SET mode_facturation = 'forfait' WHERE id = $1`, [ct.contratId], /contrats_forfait_requiert_montant/);
      await refus(c, `UPDATE public.contrats SET mode_facturation = 'forfait', montant_forfait = 0 WHERE id = $1`, [ct.contratId], /contrats_montant_forfait_positif/);
      await refus(c, `UPDATE public.contrats SET mode_facturation = 'mensuel' WHERE id = $1`, [ct.contratId], /contrats_mode_facturation_valide/);
      await c.query(`UPDATE public.contrats SET mode_facturation = 'forfait', montant_forfait = 150 WHERE id = $1`, [ct.contratId]);
    });
  });

  it('exige nom, adresse et e-mail quand le payeur est un proche', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await refus(c, `UPDATE public.contrats SET payeur_type = 'proche' WHERE id = $1`, [ct.contratId], /contrats_proche_requiert_coordonnees/);
      await refus(c, `UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'P', payeur_adresse = '  ', payeur_email = 'p@x.test' WHERE id = $1`, [ct.contratId], /contrats_proche_requiert_coordonnees/);
      await refus(c, `UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'P', payeur_adresse = 'A', payeur_email = 'pas-un-email' WHERE id = $1`, [ct.contratId], /contrats_payeur_email_format/);
      await refus(c, `UPDATE public.contrats SET payeur_type = 'structure' WHERE id = $1`, [ct.contratId], /contrats_payeur_type_valide/);
      await c.query(`UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'P', payeur_adresse = 'A', payeur_email = 'p@x.test' WHERE id = $1`, [ct.contratId]);
    });
  });
});

decrire('Praticiens : profil de facturation', () => {
  it('contrôle le régime de TVA et son taux', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      await refus(c, `UPDATE public.praticiens SET regime_tva = 'assujetti' WHERE id = $1`, [pro], /praticiens_taux_tva_coherent/);
      await refus(c, `UPDATE public.praticiens SET regime_tva = 'assujetti', taux_tva = 0 WHERE id = $1`, [pro], /praticiens_taux_tva_coherent/);
      await refus(c, `UPDATE public.praticiens SET regime_tva = 'franchise_293B', taux_tva = 20 WHERE id = $1`, [pro], /praticiens_taux_tva_coherent/);
      await refus(c, `UPDATE public.praticiens SET regime_tva = 'micro' WHERE id = $1`, [pro], /praticiens_regime_tva_valide/);
      await c.query(`UPDATE public.praticiens SET regime_tva = 'assujetti', taux_tva = 20 WHERE id = $1`, [pro]);
      await c.query(`UPDATE public.praticiens SET regime_tva = 'franchise_293B', taux_tva = NULL WHERE id = $1`, [pro]);
    });
  });

  it('normalise l\'IBAN (majuscules, sans espaces) et en contrôle le format', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      await c.query(`UPDATE public.praticiens SET iban = 'fr76 3000 6000 0112 3456 7890 189' WHERE id = $1`, [pro]);
      expect((await q(c, `SELECT iban FROM public.praticiens WHERE id = $1`, [pro]))[0].iban).toBe('FR7630006000011234567890189');
      await refus(c, `UPDATE public.praticiens SET iban = 'pas un iban' WHERE id = $1`, [pro], /praticiens_iban_format/);
      await c.query(`UPDATE public.praticiens SET iban = '   ' WHERE id = $1`, [pro]);
      expect((await q(c, `SELECT iban FROM public.praticiens WHERE id = $1`, [pro]))[0].iban).toBeNull();
    });
  });

  it('borne le délai de paiement', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      await refus(c, `UPDATE public.praticiens SET delai_paiement_jours = 90 WHERE id = $1`, [pro], /praticiens_delai_paiement_valide/);
      await refus(c, `UPDATE public.praticiens SET delai_paiement_jours = -1 WHERE id = $1`, [pro], /praticiens_delai_paiement_valide/);
      await c.query(`UPDATE public.praticiens SET delai_paiement_jours = 45, penalites_retard = 'Taux légal majoré' WHERE id = $1`, [pro]);
    });
  });
});


// ───────────────────────────── étape 1 bis ─────────────────────────────

decrire('Paiements immuables', () => {
  const ajouter = `INSERT INTO public.paiements (facture_id, date, montant, moyen) VALUES ($1, '2026-04-01', $2, 'virement')`;

  it('refuse toute modification et toute suppression, y compris pour postgres et service_role', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await c.query(ajouter, [v.factureId, 45]);
      const motif = /Paiement non modifiable/;
      await refus(c, `UPDATE public.paiements SET montant = 10 WHERE facture_id = $1`, [v.factureId], motif);
      await refus(c, `UPDATE public.paiements SET moyen = 'cheque' WHERE facture_id = $1`, [v.factureId], motif);
      await refus(c, `DELETE FROM public.paiements WHERE facture_id = $1`, [v.factureId], motif);
      await c.query('SET LOCAL ROLE service_role');
      await refus(c, `UPDATE public.paiements SET montant = 10 WHERE facture_id = $1`, [v.factureId], motif);
      await refus(c, `DELETE FROM public.paiements WHERE facture_id = $1`, [v.factureId], motif);
      await retourPostgres(c);
    });
  });

  it('le praticien lit et ajoute ses paiements mais n\'a plus le droit de les modifier', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await commeUtilisateur(c, v.pro);
      await c.query(ajouter, [v.factureId, 45]);
      expect(await q(c, `SELECT 1 FROM public.paiements`)).toHaveLength(1);
      await refus(c, `UPDATE public.paiements SET montant = 10 WHERE facture_id = $1`, [v.factureId], /permission denied/);
      await refus(c, `DELETE FROM public.paiements WHERE facture_id = $1`, [v.factureId], /permission denied/);
    });
  });

  it('une correction passe par une nouvelle ligne négative, jamais au-delà de ce qui a été encaissé', async () => {
    await transaction(async c => {
      const v = await factureValidee(c);
      await c.query(ajouter, [v.factureId, 45]);
      await c.query(ajouter, [v.factureId, -15]);                 // correction partielle
      await refus(c, ajouter, [v.factureId, -31], /supérieure aux paiements enregistrés \(30/);
      await c.query(ajouter, [v.factureId, -30]);                 // solde à zéro
      const [r] = await q(c, `SELECT sum(montant)::float8 AS somme, count(*)::int AS n FROM public.paiements WHERE facture_id = $1`, [v.factureId]);
      expect(r).toEqual({ somme: 0, n: 3 });
      await refus(c, ajouter, [v.factureId, -0.01], /supérieure aux paiements enregistrés/);
      await refus(c, ajouter, [v.factureId, 0], /paiements_montant_non_nul/);
    });
  });
});

decrire('Adresse du bénéficiaire obligatoire à la validation', () => {
  async function brouillon(c: Client): Promise<{ f: string; ct: ContratFixture }> {
    const pro = await creerPraticien(c);
    const ct = await creerContrat(c, pro);
    await creerSeance(c, pro, ct, '2026-03-10');
    return { f: (await generer(c, ct.contratId, '2026-03-01'))!, ct };
  }
  const motif = /Adresse du bénéficiaire incomplète \(mention obligatoire\)/;

  it('refuse sans rue, sans code postal ou sans ville, et nomme ce qui manque', async () => {
    await transaction(async c => {
      const { f, ct } = await brouillon(c);
      await c.query(`UPDATE public.participants SET adresse_rue = NULL WHERE id = $1`, [ct.participantId]);
      await refus(c, `SELECT public.valider_facture($1)`, [f], /: rue$/);
      await c.query(`UPDATE public.participants SET adresse_rue = '10 rue Test', adresse_code_postal = '   ', adresse_ville = NULL WHERE id = $1`, [ct.participantId]);
      await refus(c, `SELECT public.valider_facture($1)`, [f], /: code postal, ville$/);
      await c.query(`UPDATE public.participants SET adresse_code_postal = NULL, adresse_ville = NULL, adresse_rue = NULL WHERE id = $1`, [ct.participantId]);
      await refus(c, `SELECT public.valider_facture($1)`, [f], motif);
      // Rien n'a été consommé : le brouillon reste, sans numéro.
      const [r] = await q(c, `SELECT statut, numero FROM public.factures WHERE id = $1`, [f]);
      expect(r).toEqual({ statut: 'brouillon', numero: null });
    });
  });

  it('reste exigée quand un proche paie, et figure alors dans le snapshot', async () => {
    await transaction(async c => {
      const { f, ct } = await brouillon(c);
      await c.query(
        `UPDATE public.contrats SET payeur_type = 'proche', payeur_nom = 'Proche Test', payeur_adresse = '5 rue Proche', payeur_email = 'proche@fact.test' WHERE id = $1`,
        [ct.contratId],
      );
      await c.query(`UPDATE public.participants SET adresse_ville = NULL WHERE id = $1`, [ct.participantId]);
      await refus(c, `SELECT public.valider_facture($1)`, [f], motif);
      await c.query(`UPDATE public.participants SET adresse_ville = 'Villetest' WHERE id = $1`, [ct.participantId]);
      await valider(c, f);
      const [r] = await q(c, `SELECT snapshot_destinataire AS d FROM public.factures WHERE id = $1`, [f]);
      expect(r.d).toMatchObject({ role: 'proche', beneficiaire: { adresse: { rue: '10 rue Test', code_postal: '00000', ville: 'Villetest' } } });
    });
  });

  it('IBAN et pénalités restent facultatifs', async () => {
    await transaction(async c => {
      const { f, ct } = await brouillon(c);
      await c.query(`UPDATE public.praticiens SET iban = NULL, penalites_retard = NULL WHERE id = (SELECT praticien_id FROM public.contrats WHERE id = $1)`, [ct.contratId]);
      expect(await valider(c, f)).toMatch(/^\d{4}-0001$/);
    });
  });
});

decrire('TVA : prix HT, TVA ajoutée (hypothèse à confirmer)', () => {
  async function cas(c: Client, opts: { taux?: number | null; tarif?: number; dates?: string[] } = {}) {
    const pro = await creerPraticien(c);
    if (opts.taux !== undefined && opts.taux !== null) {
      await c.query(`UPDATE public.praticiens SET regime_tva = 'assujetti', taux_tva = $2 WHERE id = $1`, [pro, opts.taux]);
    }
    const ct = await creerContrat(c, pro, { tarifs: [{ debut: '2026-01-01', tarif: opts.tarif ?? 45 }] });
    for (const d of opts.dates ?? ['2026-03-03', '2026-03-10']) await creerSeance(c, pro, ct, d);
    return { pro, ct };
  }
  const montants = (c: Client, id: string) =>
    q(c, `SELECT total_ht::float8 AS ht, montant_tva::float8 AS tva, total::float8 AS ttc, part_client::float8 AS client, part_urssaf::float8 AS urssaf, taux_tva::float8 AS taux FROM public.factures WHERE id = $1`, [id]).then(r => r[0]);

  it('assujetti 20 % : lignes en HT, TVA ajoutée, total TTC, taux figé', async () => {
    await transaction(async c => {
      const { ct } = await cas(c, { taux: 20 });
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      expect((await lignes(c, f)).map(l => l.montant)).toEqual([45, 45]);           // HT
      // Le brouillon annonce déjà le TTC ; le taux n'est figé qu'à la validation.
      expect(await montants(c, f)).toEqual({ ht: 90, tva: 18, ttc: 108, client: 108, urssaf: 0, taux: null });
      await valider(c, f);
      expect(await montants(c, f)).toEqual({ ht: 90, tva: 18, ttc: 108, client: 108, urssaf: 0, taux: 20 });
      const [s] = await q(c, `SELECT snapshot_emetteur->>'taux_tva' AS taux, snapshot_emetteur->>'regime_tva' AS regime FROM public.factures WHERE id = $1`, [f]);
      expect(s).toEqual({ taux: '20.00', regime: 'assujetti' });
    });
  });

  it('franchise 293 B : pas de TVA, total = HT', async () => {
    await transaction(async c => {
      const { ct } = await cas(c);
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await valider(c, f);
      expect(await montants(c, f)).toEqual({ ht: 90, tva: 0, ttc: 90, client: 90, urssaf: 0, taux: 0 });
    });
  });

  it('calcule la TVA une fois sur le total HT, arrondie au centime', async () => {
    await transaction(async c => {
      // 3 × 33,33 = 99,99 HT ; 20 % = 19,998 → 20,00 (par ligne : 6,67 × 3 = 20,01).
      const { ct } = await cas(c, { taux: 20, tarif: 33.33, dates: ['2026-03-03', '2026-03-10', '2026-03-17'] });
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await valider(c, f);
      expect(await montants(c, f)).toMatchObject({ ht: 99.99, tva: 20, ttc: 119.99 });
    });
  });

  it('la validation recalcule avec le régime du moment (changement entre brouillon et validation)', async () => {
    await transaction(async c => {
      const { pro, ct } = await cas(c, { taux: 20 });
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      expect((await montants(c, f)).ttc).toBe(108);
      await c.query(`UPDATE public.praticiens SET regime_tva = 'franchise_293B', taux_tva = NULL WHERE id = $1`, [pro]);
      await valider(c, f);
      expect(await montants(c, f)).toMatchObject({ ht: 90, tva: 0, ttc: 90, taux: 0 });
    });
  });

  it('les montants de TVA sont figés après validation, et la cohérence HT + TVA = TTC est imposée', async () => {
    await transaction(async c => {
      const { pro, ct } = await cas(c, { taux: 20 });
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await valider(c, f);
      const motif = /validée : seuls statut et pdf_path/;
      await refus(c, `UPDATE public.factures SET montant_tva = 0, total = total_ht WHERE id = $1`, [f], motif);
      await refus(c, `UPDATE public.factures SET taux_tva = 5.5 WHERE id = $1`, [f], motif);
      await refus(c, `UPDATE public.factures SET total_ht = 1 WHERE id = $1`, [f], motif);
      const ct2 = await creerContrat(c, pro);
      await refus(c,
        `INSERT INTO public.factures (praticien_id, contrat_id, participant_id, periode, total_ht, montant_tva, total, part_client) VALUES ($1, $2, $3, '2026-05-01', 100, 20, 130, 130)`,
        [pro, ct2.contratId, ct2.participantId], /factures_tva_coherente/);
    });
  });

  it('un avoir reprend le taux de la facture d\'origine, même si le régime a changé depuis', async () => {
    await transaction(async c => {
      const { pro, ct } = await cas(c, { taux: 20 });
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      await valider(c, f);                                                       // 90 HT, 108 TTC
      await c.query(`UPDATE public.praticiens SET regime_tva = 'franchise_293B', taux_tva = NULL WHERE id = $1`, [pro]);
      const nouvelAvoir = async (ht: number): Promise<string> => {
        const id = randomUUID();
        await c.query(
          `INSERT INTO public.factures (id, praticien_id, contrat_id, participant_id, periode, type, facture_origine_id) VALUES ($1, $2, $3, $4, '2026-03-01', 'avoir', $5)`,
          [id, pro, ct.contratId, ct.participantId, f],
        );
        await c.query(`INSERT INTO public.lignes_facture (facture_id, libelle, quantite, prix_unitaire, montant) VALUES ($1, 'Avoir', 1, $2, $2)`, [id, ht]);
        return id;
      };
      await refus(c, `SELECT public.valider_facture($1)`, [await nouvelAvoir(91)], /dépasse la facture d'origine \(108/);   // 91 × 1,2 = 109,20 TTC
      const avoir = await nouvelAvoir(90);
      await valider(c, avoir);
      expect(await montants(c, avoir)).toMatchObject({ ht: 90, tva: 18, ttc: 108, taux: 20 });
      expect((await q(c, `SELECT statut FROM public.factures WHERE id = $1`, [f]))[0].statut).toBe('annulee');   // avoir total
    });
  });
});

decrire('Bilans exclus de la facturation', () => {
  it('ne facture que les séances de type soin, pas bilan ni bilan_initial', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      const soin = await creerSeance(c, pro, ct, '2026-03-03', 'realisee', '10:00', 'seance');
      await creerSeance(c, pro, ct, '2026-03-04', 'realisee', '10:00', 'bilan');
      await creerSeance(c, pro, ct, '2026-03-05', 'realisee', '10:00', 'bilan_initial');
      const ls = await lignes(c, (await generer(c, ct.contratId, '2026-03-01'))!);
      expect(ls.map(l => l.seance_id)).toEqual([soin]);
      expect(ls[0].montant).toBe(45);
    });
  });

  it('un mois sans soin réalisé, même avec des bilans réalisés, ne produit aucun brouillon', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      await creerSeance(c, pro, ct, '2026-03-04', 'realisee', '10:00', 'bilan');
      await creerSeance(c, pro, ct, '2026-03-05', 'realisee', '10:00', 'bilan_initial');
      expect(await generer(c, ct.contratId, '2026-03-01')).toBeNull();
    });
  });

  it('un bilan sans tarif applicable ne bloque pas la génération', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro, { tarifs: [{ debut: '2026-03-15', tarif: 50 }] });
      await creerSeance(c, pro, ct, '2026-03-02', 'realisee', '10:00', 'bilan_initial');   // avant toute version de tarif
      await creerSeance(c, pro, ct, '2026-03-20');
      const ls = await lignes(c, (await generer(c, ct.contratId, '2026-03-01'))!);
      expect(ls.map(l => [l.date, l.montant])).toEqual([['2026-03-20', 50]]);
    });
  });

  it('le brouillon se recalcule sans le bilan si une séance change de type', async () => {
    await transaction(async c => {
      const pro = await creerPraticien(c);
      const ct = await creerContrat(c, pro);
      const s = await creerSeance(c, pro, ct, '2026-03-03');
      await creerSeance(c, pro, ct, '2026-03-10');
      const f = (await generer(c, ct.contratId, '2026-03-01'))!;
      expect(await lignes(c, f)).toHaveLength(2);
      await c.query(`UPDATE public.seances SET type = 'bilan' WHERE id = $1`, [s]);
      expect(await generer(c, ct.contratId, '2026-03-01')).toBe(f);
      expect((await lignes(c, f)).map(l => l.date)).toEqual(['2026-03-10']);
    });
  });
});
