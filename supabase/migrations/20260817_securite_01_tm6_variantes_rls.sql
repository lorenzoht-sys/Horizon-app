-- ============================================================================
-- 20260817_securite_01_tm6_variantes_rls.sql
-- ============================================================================
--
-- ✏️ RÉÉCRIT le 2026-08-19 suite à [RÉG-01] (docs/RAPPORT_SECURITE.md) : la
-- première version verrouillait toute écriture `authenticated` (réservée à
-- `service_role`), ce qui cassait `src/hooks/useTm6Variantes.ts` (insert()
-- direct depuis le client authentifié côté navigateur, aucune route backend
-- service_role — code vivant, voir [RÉG-01] pour la preuve de chemin
-- complet). Cette version ferme la même faille sans ce verrou total : elle
-- donne à `tm6_variantes` un propriétaire par ligne (`praticien_id`,
-- nullable — NULL = entrée système/seed, sans propriétaire individuel) et
-- scope les policies d'écriture au propriétaire, plutôt que de tout
-- réserver à service_role. `useTm6Variantes.ts` continue de fonctionner :
-- une nouvelle variante créée par un praticien lui appartient (trigger
-- d'auto-remplissage, même fonction que le reste du projet) et lui reste
-- modifiable/supprimable ; il ne peut plus toucher aux entrées système ni à
-- celles des autres praticiens.
--
-- Ferme : [F-01] (volet tm6_variantes) et [F-09] du rapport
-- docs/RAPPORT_SECURITE.md — traités dans le même fichier car F-09
-- (ENABLE ROW LEVEL SECURITY) doit être appliqué avant que les policies
-- resserrées par F-01 ci-dessous ne produisent un effet quelconque : sans
-- RLS activé, des policies existent mais ne filtrent rien.
--
-- Preuve (voir docs/RAPPORT_SECURITE.md, F-01/F-09) : la table
-- `tm6_variantes` (créée par 20260701_tm6_variantes.sql, SANS RLS ni
-- policy dans ce fichier de migration) a pourtant, en production, 4
-- policies `praticien_select/insert/update/delete_tm6_variantes` avec
-- `USING (true)` / `WITH CHECK (true)`, confirmées par requête live le
-- 2026-08-17 (SQL Editor, projet prod) :
--   select schemaname, tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname='public' and tablename='tm6_variantes';
-- Ces objets ont donc été créés hors migration versionnée (directement en
-- Supabase Studio), constat déjà documenté pour d'autres tables du projet.
-- La table n'avait aucune colonne `praticien_id` avant cette migration —
-- `USING(true)` permettait à N'IMPORTE QUEL praticien authentifié de
-- modifier ou supprimer N'IMPORTE QUELLE ligne du catalogue commun à tous.
--
-- Complément 2026-08-19 (ACL brute, aclexplode — voir docs/RAPPORT_SECURITE.md,
-- F-01) : `authenticated` a en prod un GRANT ALL sur cette table, y compris
-- TRUNCATE — un privilège que RLS ne filtre JAMAIS, quelle que soit la
-- qualité des policies. Cette migration REVOKE explicitement TRUNCATE pour
-- `authenticated` ; `service_role` garde tous ses privilèges (rôle interne
-- de confiance, pas de raison de le restreindre).
--
-- Impact : aucune donnée de santé (catalogue de tests, pas de donnée
-- patient) — mais intégrité du catalogue partagé compromise pour tous les
-- praticiens si un seul altère ou supprime des entrées appartenant à
-- quelqu'un d'autre (ou aux entrées système).
--
-- Correctif : ajoute `praticien_id` (nullable), active RLS (idempotent),
-- scope les policies d'écriture au propriétaire (`praticien_id =
-- auth.uid()`), garde la lecture ouverte à tout praticien connecté (c'est
-- un catalogue de référence partagé, pas une donnée à cloisonner en
-- lecture), et révoque TRUNCATE pour `authenticated`.
--
-- Note sur `supprimer()` (src/hooks/useTm6Variantes.ts:44) : exporté par le
-- hook mais non appelé nulle part dans src/ au 2026-08-19 (grep vérifié) —
-- la policy DELETE ci-dessous est écrite par cohérence avec le reste du
-- projet (scopée au propriétaire, pas un verrou total), pas parce que la
-- fonctionnalité est actuellement utilisée.
--
-- ⚠️ NON TESTÉ AUTOMATIQUEMENT (le harnais tests/security/rls.spec.ts n'a
-- pas été exécuté sur staging avec cette version réécrite — staging ne
-- reflète de toute façon pas l'état vulnérable de prod actuellement, voir
-- docs/ETAT_AUDIT.md). À TESTER MANUELLEMENT AVANT tout passage en
-- production — aucun SQL de cette session ne doit être exécuté directement
-- sur la base de prod.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
-- Pour revenir exactement à l'état d'avant ce correctif (déconseillé — ça
-- restaure la faille F-01/F-09) :
--
--   ALTER TABLE public.tm6_variantes DISABLE ROW LEVEL SECURITY;
--   DROP TRIGGER IF EXISTS trg_tm6_variantes_praticien_id ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_insert_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_update_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_delete_tm6_variantes" ON public.tm6_variantes;
--   GRANT TRUNCATE ON public.tm6_variantes TO authenticated;
--   ALTER TABLE public.tm6_variantes DROP COLUMN IF EXISTS praticien_id;
--   CREATE POLICY "praticien_select_tm6_variantes" ON public.tm6_variantes FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "praticien_insert_tm6_variantes" ON public.tm6_variantes FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY "praticien_update_tm6_variantes" ON public.tm6_variantes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY "praticien_delete_tm6_variantes" ON public.tm6_variantes FOR DELETE TO authenticated USING (true);
--
-- ============================================================================

-- [F-09] Active RLS — idempotent, ne casse rien si déjà actif.
ALTER TABLE public.tm6_variantes ENABLE ROW LEVEL SECURITY;

-- [F-01] Propriétaire par ligne — NULL pour les entrées système/seed
-- (catalogue de base, sans propriétaire individuel), rempli automatiquement
-- pour toute nouvelle ligne créée par un praticien via le trigger ci-dessous.
ALTER TABLE public.tm6_variantes
  ADD COLUMN IF NOT EXISTS praticien_id UUID REFERENCES public.praticiens(id) ON DELETE SET NULL;

-- Même fonction que le reste du projet (set_praticien_id_from_auth,
-- voir supabase/schema.sql) : ne remplit praticien_id QUE s'il est encore
-- NULL, donc n'écrase jamais une valeur explicitement fournie — c'est la
-- policy WITH CHECK ci-dessous, pas ce trigger, qui empêche un praticien de
-- s'attribuer une ligne au nom de quelqu'un d'autre.
DROP TRIGGER IF EXISTS trg_tm6_variantes_praticien_id ON public.tm6_variantes;
CREATE TRIGGER trg_tm6_variantes_praticien_id
  BEFORE INSERT ON public.tm6_variantes
  FOR EACH ROW EXECUTE FUNCTION public.set_praticien_id_from_auth();

-- Lecture : reste ouverte à tout praticien connecté (catalogue de
-- référence partagé, aucune donnée de santé, aucune raison de cloisonner
-- en lecture — voir "Impact" ci-dessus).
DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
CREATE POLICY "praticien_select_tm6_variantes"
  ON public.tm6_variantes
  FOR SELECT
  TO authenticated
  USING (true);

-- Écriture : scopée au propriétaire — plus de USING(true)/WITH CHECK(true).
-- Une entrée système (praticien_id NULL) ou appartenant à un autre
-- praticien n'est jamais modifiable/supprimable par `authenticated`
-- (NULL = auth.uid() n'est jamais vrai en SQL, donc les entrées système
-- sont protégées par construction, pas par un cas particulier explicite).
DROP POLICY IF EXISTS "praticien_insert_tm6_variantes" ON public.tm6_variantes;
CREATE POLICY "praticien_insert_tm6_variantes"
  ON public.tm6_variantes
  FOR INSERT
  TO authenticated
  WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "praticien_update_tm6_variantes" ON public.tm6_variantes;
CREATE POLICY "praticien_update_tm6_variantes"
  ON public.tm6_variantes
  FOR UPDATE
  TO authenticated
  USING (praticien_id = auth.uid())
  WITH CHECK (praticien_id = auth.uid());

DROP POLICY IF EXISTS "praticien_delete_tm6_variantes" ON public.tm6_variantes;
CREATE POLICY "praticien_delete_tm6_variantes"
  ON public.tm6_variantes
  FOR DELETE
  TO authenticated
  USING (praticien_id = auth.uid());

-- [RÉG-01 / TRUNCATE] RLS ne filtre jamais TRUNCATE — seul un REVOKE ferme
-- ce chemin. service_role garde le privilège (rôle interne de confiance).
REVOKE TRUNCATE ON public.tm6_variantes FROM authenticated;

NOTIFY pgrst, 'reload schema';
