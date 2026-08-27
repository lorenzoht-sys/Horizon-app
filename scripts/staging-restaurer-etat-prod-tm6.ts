// scripts/staging-restaurer-etat-prod-tm6.ts
//
// Reproduit sur STAGING l'état vulnérable de `tm6_variantes` tel qu'il est
// relevé en PRODUCTION le 2026-08-27, pour que le lot 8
// (20260817_securite_01_tm6_variantes_rls.sql) soit réellement testable.
//
// POURQUOI CE SCRIPT EXISTE
// -------------------------
// Staging avait RLS activée sur `tm6_variantes` et ZÉRO policy : tout est
// refusé pour `authenticated`. Dans cet état, le test [F-01] du harnais
// passe au vert — non pas parce que la faille est fermée, mais parce que
// praticien B ne peut rien faire du tout. C'est exactement le « vert
// silencieux » que le job `audit` de .github/workflows/security.yml est
// censé empêcher. Appliquer le lot 8 sur cette base ne prouverait rien.
//
// POURQUOI CE N'EST PAS UNE MIGRATION VERSIONNÉE
// ----------------------------------------------
// Ce fichier recrée des policies `USING(true)`. Placé dans
// supabase/migrations/, il serait rejoué à chaque reconstruction d'un
// environnement depuis les migrations et rouvrirait la faille tout seul.
// Un fixture de test n'a rien à faire dans l'historique de migrations.
//
// ÉTAT REPRODUIT (relevé prod 2026-08-27, SQL Editor + aclexplode,
// recoupé avec supabase/_production_schema_dump.sql du 2026-08-22)
// ----------------------------------------------------------------
//   - RLS activée (relrowsecurity = true, relforcerowsecurity = false)
//   - 4 policies AS PERMISSIVE **TO public** (pas TO authenticated) :
//       select  USING (true)
//       insert  WITH CHECK (true)
//       update  USING (true)   <- AUCUN WITH CHECK explicite
//       delete  USING (true)
//   - GRANT ALL à `authenticated`, TRUNCATE compris
//   - aucune colonne praticien_id, aucun trigger
//
// DONNÉES AJOUTÉES (staging n'a aucune ligne dans tm6_variantes, la prod
// en a une) — trois cas, pour exercer aussi le backfill du lot 8 :
//   - « FIXTURE Stepper »  : 1 bilan rattaché, 1 seul praticien
//                            -> le backfill doit lui attribuer ce praticien
//   - « FIXTURE Pedalier » : aucun bilan rattaché
//                            -> aucune déduction possible, reste NULL
//   - « FIXTURE Couloir »  : bilans de DEUX praticiens différents
//                            -> déduction ambiguë, reste NULL
//
// ⚠️ Ce script MODIFIE `bilans.tm6_variante_id` sur les bilans de démo de
// staging pour créer ces rattachements. C'est de la donnée de seed
// (scripts/seed-staging.sql), restaurable par scripts/staging-reseed.ts.
//
// ⚠️ Après exécution, staging est dans un état VULNÉRABLE. Il doit être
// suivi immédiatement de l'application du lot 8 — ne jamais laisser
// staging dormir dans cet état.
//
// Usage :
//   npx tsx scripts/staging-restaurer-etat-prod-tm6.ts --apply

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

// UUID fixes : le fixture doit être rejouable et ses lignes reconnaissables.
const V_STEPPER = 'f1000000-0000-4000-8000-000000000001';
const V_PEDALIER = 'f1000000-0000-4000-8000-000000000002';
const V_COULOIR = 'f1000000-0000-4000-8000-000000000003';

function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return out;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Garde-fou identique aux autres scripts de staging (staging-query.ts,
// staging-apply-migration.ts) : refuse toute connexion qui pointe vers la
// référence de projet production, et refuse aussi toute connexion dont on
// ne peut pas CONFIRMER qu'elle vise staging.
function assertStagingTarget(connectionString: string): void {
  let host: string;
  let user: string;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    user = decodeURIComponent(url.username);
  } catch {
    throw new Error("STAGING_DATABASE_URL n'est pas une URL de connexion valide.");
  }
  const candidates = [host, user];
  if (candidates.some(c => c.includes(PRODUCTION_REF))) {
    throw new Error('Garde-fou : cette connexion pointe vers la référence de projet PRODUCTION. Abandon.');
  }
  if (!candidates.some(c => c.includes(STAGING_REF))) {
    throw new Error('Garde-fou : impossible de confirmer que cette connexion pointe vers staging (réf. de projet non reconnue). Abandon.');
  }
}

// Praticien ayant le plus de bilans sur staging — sert de « praticien A »
// du fixture. Déduit, jamais codé en dur : le seed de staging peut être
// régénéré avec d'autres identifiants.
const PRATICIEN_A = `(
  SELECT praticien_id FROM public.bilans
  WHERE praticien_id IS NOT NULL
  GROUP BY praticien_id ORDER BY count(*) DESC, praticien_id LIMIT 1
)`;

const STATEMENTS: Array<{ label: string; sql: string }> = [
  // ── 1. Défaire le lot 8 s'il est déjà appliqué (rend le fixture rejouable).
  //    Les policies doivent partir AVANT la colonne : elles en dépendent, et
  //    un DROP COLUMN sans CASCADE échouerait.
  {
    label: 'Retrait des policies existantes',
    sql: `
      DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
      DROP POLICY IF EXISTS "praticien_insert_tm6_variantes" ON public.tm6_variantes;
      DROP POLICY IF EXISTS "praticien_update_tm6_variantes" ON public.tm6_variantes;
      DROP POLICY IF EXISTS "praticien_delete_tm6_variantes" ON public.tm6_variantes;
    `,
  },
  {
    label: 'Retrait du trigger et de la colonne praticien_id (état pré-lot 8)',
    sql: `
      DROP TRIGGER IF EXISTS trg_tm6_variantes_praticien_id ON public.tm6_variantes;
      ALTER TABLE public.tm6_variantes DROP COLUMN IF EXISTS praticien_id;
    `,
  },

  // ── 2. Reproduire les privilèges de prod (TRUNCATE compris : c'est le
  //    privilège que RLS ne filtre jamais, et donc le seul que le REVOKE du
  //    lot 8 puisse réellement fermer).
  {
    label: 'GRANT ALL à authenticated (TRUNCATE compris, comme en prod)',
    sql: `
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
        ON public.tm6_variantes TO authenticated;
    `,
  },

  // ── 3. Reproduire RLS + les 4 policies permissives, à l'identique.
  {
    label: 'RLS activée + 4 policies USING(true) TO public',
    sql: `
      ALTER TABLE public.tm6_variantes ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "praticien_select_tm6_variantes" ON public.tm6_variantes
        AS PERMISSIVE FOR SELECT TO public USING (true);
      CREATE POLICY "praticien_insert_tm6_variantes" ON public.tm6_variantes
        AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
      -- Volontairement SANS WITH CHECK : c'est l'état exact de la prod.
      CREATE POLICY "praticien_update_tm6_variantes" ON public.tm6_variantes
        AS PERMISSIVE FOR UPDATE TO public USING (true);
      CREATE POLICY "praticien_delete_tm6_variantes" ON public.tm6_variantes
        AS PERMISSIVE FOR DELETE TO public USING (true);
    `,
  },

  // ── 4. Les trois lignes de fixture.
  {
    label: 'Insertion des 3 variantes de fixture',
    sql: `
      INSERT INTO public.tm6_variantes (id, nom, type_mesure) VALUES
        ('${V_STEPPER}',  'FIXTURE Stepper (proprietaire deductible)', 'distance'),
        ('${V_PEDALIER}', 'FIXTURE Pedalier (jamais utilise)',         'distance'),
        ('${V_COULOIR}',  'FIXTURE Couloir (multi-praticiens)',        'distance')
      ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    label: 'Rattachement : Stepper -> 1 bilan du praticien A',
    sql: `
      UPDATE public.bilans SET tm6_variante_id = '${V_STEPPER}'
      WHERE id = (
        SELECT b.id FROM public.bilans b
        WHERE b.praticien_id = ${PRATICIEN_A}
        ORDER BY b.created_at LIMIT 1
      );
    `,
  },
  {
    label: 'Rattachement : Couloir -> 1 autre bilan du praticien A',
    sql: `
      UPDATE public.bilans SET tm6_variante_id = '${V_COULOIR}'
      WHERE id = (
        SELECT b.id FROM public.bilans b
        WHERE b.praticien_id = ${PRATICIEN_A}
          AND b.tm6_variante_id IS DISTINCT FROM '${V_STEPPER}'
        ORDER BY b.created_at DESC LIMIT 1
      );
    `,
  },
  {
    label: 'Rattachement : Couloir -> 1 bilan d\'un AUTRE praticien',
    sql: `
      UPDATE public.bilans SET tm6_variante_id = '${V_COULOIR}'
      WHERE id = (
        SELECT b.id FROM public.bilans b
        WHERE b.praticien_id IS NOT NULL
          AND b.praticien_id <> ${PRATICIEN_A}
        ORDER BY b.created_at LIMIT 1
      );
    `,
  },
];

const VERIFICATION = `
  SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tm6_variantes'::regclass)                   AS rls_active,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tm6_variantes')       AS nb_policies,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tm6_variantes'
       AND roles::text = '{public}')                                                                     AS policies_to_public,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
       AND table_name = 'tm6_variantes' AND column_name = 'praticien_id')                                AS a_colonne_praticien_id,
    (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.tm6_variantes'::regclass
       AND NOT tgisinternal)                                                                             AS nb_triggers,
    (SELECT count(*) FROM public.tm6_variantes)                                                          AS nb_variantes,
    (SELECT count(*) FROM public.bilans WHERE tm6_variante_id = '${V_STEPPER}')                           AS bilans_stepper,
    (SELECT count(*) FROM public.bilans WHERE tm6_variante_id = '${V_PEDALIER}')                          AS bilans_pedalier,
    (SELECT count(DISTINCT praticien_id) FROM public.bilans WHERE tm6_variante_id = '${V_COULOIR}')       AS praticiens_couloir,
    (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public'
       AND table_name = 'tm6_variantes' AND grantee = 'authenticated'
       AND privilege_type = 'TRUNCATE')                                                                  AS authenticated_a_truncate;
`;

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--apply')) {
    throw new Error(
      'Ce script écrit sur staging et le laisse dans un état VULNÉRABLE (fixture de test).\n' +
        '--apply est obligatoire, et le lot 8 doit être appliqué juste après.'
    );
  }

  const envPath = path.resolve(__dirname, '../.env.test.local');
  const parsed = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  const connectionString = process.env.STAGING_DATABASE_URL;
  if (!connectionString) {
    throw new Error(`STAGING_DATABASE_URL introuvable (ni dans ${envPath}, ni dans l'environnement).`);
  }
  assertStagingTarget(connectionString);

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');
    try {
      for (const { label, sql } of STATEMENTS) {
        console.log(`- ${label}`);
        await client.query(sql);
      }
      await client.query('COMMIT');
      console.log('\nTransaction validée.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const { rows } = await client.query(VERIFICATION);
    console.log('\nÉtat de staging après restauration :');
    console.log(JSON.stringify(rows[0], null, 2));
    console.log(
      '\nAttendu : rls_active=true, nb_policies=4, policies_to_public=4,\n' +
        'a_colonne_praticien_id=0, nb_triggers=0, nb_variantes=3,\n' +
        'bilans_stepper=1, bilans_pedalier=0, praticiens_couloir=2,\n' +
        'authenticated_a_truncate=1.\n' +
        '\n⚠️ Staging est maintenant VULNÉRABLE (F-01 ouvert). Enchaîner :\n' +
        '   npx vitest run tests/security/rls.spec.ts   -> [F-01] doit ÉCHOUER\n' +
        '   npx tsx scripts/staging-apply-migration.ts --apply 20260817_securite_01_tm6_variantes_rls.sql\n' +
        '   npx vitest run tests/security/rls.spec.ts   -> [F-01] doit PASSER'
    );
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
