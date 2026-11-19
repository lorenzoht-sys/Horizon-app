-- Droits de claude_rate_limit ramenés à la règle du 2026-08-29 (audit du 19/11/2026).
--
-- Constat (audit de la production, lecture seule) : la table accordait TOUS les
-- droits à `authenticated`, TRUNCATE compris, hérités du schéma de départ
-- (20260528000000_baseline_schema_prod.sql : GRANT ALL ... TO authenticated).
-- La RLS est active sans aucune règle, donc la lecture et l'écriture étaient déjà
-- refusées à un praticien connecté ; mais TRUNCATE n'est jamais filtré par la RLS
-- (docs/REGLES.md, contrôle n° 1 du 29/08).
--
-- Sur staging, à l'inverse, service_role n'avait aucun droit : la limite de débit
-- de l'assistant (api/_lib/rateLimit.ts) ne pouvait ni lire ni écrire.
--
-- Seul usage : api/_lib/rateLimit.ts, côté serveur avec la clé service_role,
-- qui compte les appels récents (SELECT) et en ajoute un (INSERT). Rien d'autre.
-- Idempotente.

REVOKE ALL ON TABLE public.claude_rate_limit FROM PUBLIC;
REVOKE ALL ON TABLE public.claude_rate_limit FROM anon;
REVOKE ALL ON TABLE public.claude_rate_limit FROM authenticated;
REVOKE ALL ON TABLE public.claude_rate_limit FROM service_role;
GRANT SELECT, INSERT ON TABLE public.claude_rate_limit TO service_role;

REVOKE ALL ON SEQUENCE public.claude_rate_limit_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.claude_rate_limit_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.claude_rate_limit_id_seq FROM authenticated;
GRANT USAGE ON SEQUENCE public.claude_rate_limit_id_seq TO service_role;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema = 'public' AND table_name = 'claude_rate_limit'
               AND grantee IN ('anon', 'authenticated', 'PUBLIC')) THEN
    RAISE EXCEPTION 'claude_rate_limit : anon, authenticated ou PUBLIC ont encore un droit';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.claude_rate_limit', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.claude_rate_limit', 'INSERT') THEN
    RAISE EXCEPTION 'claude_rate_limit : service_role doit pouvoir lire et écrire';
  END IF;
  IF has_table_privilege('service_role', 'public.claude_rate_limit', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.claude_rate_limit', 'DELETE') THEN
    RAISE EXCEPTION 'claude_rate_limit : service_role a plus que lecture et ajout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.claude_rate_limit'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'claude_rate_limit : la RLS doit rester active';
  END IF;
END
$controle$;
