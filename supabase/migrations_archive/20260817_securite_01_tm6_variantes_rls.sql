-- ============================================================================
-- 20260817_securite_01_tm6_variantes_rls.sql   (étape 1, lot 8)
-- ============================================================================
--
-- ✏️ RÉÉCRIT le 2026-08-19 suite à [RÉG-01] (docs/RAPPORT_SECURITE.md) : la
-- première version verrouillait toute écriture `authenticated` (réservée à
-- `service_role`), ce qui cassait `src/hooks/useTm6Variantes.ts` (insert()
-- direct depuis le client authentifié côté navigateur, aucune route backend
-- service_role — code vivant). Cette version ferme la même faille sans ce
-- verrou total : elle donne à `tm6_variantes` un propriétaire par ligne
-- (`praticien_id`) et scope les policies d'écriture au propriétaire.
--
-- ✏️ AMENDÉ le 2026-08-27 sur relevé live de production. Trois écarts avec
-- ce que ce fichier affirmait :
--
--   1. [F-09] EST DÉJÀ CLOS. Ce fichier soutenait que `tm6_variantes` n'avait
--      « jamais eu ENABLE ROW LEVEL SECURITY ». Faux au 2026-08-27 : la
--      production a `relrowsecurity = true`, et
--      `supabase/_production_schema_dump.sql` (généré depuis la prod le
--      2026-08-22, ligne 1963) porte déjà
--      `ALTER TABLE public."tm6_variantes" ENABLE ROW LEVEL SECURITY`.
--      Soit RLS a été activée manuellement entre le constat (2026-08-17) et
--      le 22, soit le constat était erroné dès l'origine. Le `ENABLE` plus
--      bas est conservé (idempotent, et nécessaire sur un environnement
--      neuf), mais cette migration ne porte plus, en pratique, que sur F-01.
--
--   2. LES POLICIES DE PROD SONT `TO public`, PAS `TO authenticated`, et
--      l'UPDATE n'a AUCUN `WITH CHECK` (Postgres applique alors `USING`
--      implicitement). Cette migration les recrée `TO authenticated` : ce
--      n'est pas qu'un resserrement de `USING(true)`, c'est aussi un
--      rétrécissement de portée de rôle, qui n'était pas documenté.
--      Sans exposition réelle à refermer : le dump de prod ne contient
--      AUCUN `GRANT ... TO anon` sur cette table, et sans privilège de
--      table une policy `TO public` n'accorde rien à `anon`. C'est de la
--      défense en profondeur, pas un correctif — dit ici explicitement
--      pour qu'un futur lecteur ne le prenne pas pour l'inverse.
--
--   3. IL N'EXISTE AUCUNE ENTRÉE SYSTÈME. Ce fichier posait
--      `praticien_id NULL = entrée système/seed`. Or il n'y a aucun INSERT
--      de seed sur `tm6_variantes` nulle part dans le dépôt (migrations,
--      scripts/seed-staging.sql, e2e) : la seule voie d'insertion est
--      `useTm6Variantes.creer()`. La production contient 1 ligne
--      (« Stepper », créée le 2026-07-24, 1 bilan rattaché) — celle du
--      praticien, pas une entrée système. Sans backfill, les policies
--      ci-dessous la gèleraient en lecture seule pour son propre auteur.
--      D'où le backfill ajouté plus bas.
--
-- Ferme : [F-01] (volet tm6_variantes) du rapport docs/RAPPORT_SECURITE.md.
--
-- Preuve (relevé live prod, 2026-08-27, SQL Editor) : 4 policies
-- `praticien_select/insert/update/delete_tm6_variantes`, toutes
-- `AS PERMISSIVE ... TO public` avec `USING (true)` / `WITH CHECK (true)`.
-- Ces objets ont été créés hors migration versionnée (directement en
-- Supabase Studio), constat déjà documenté pour d'autres tables du projet.
-- La table n'a aucune colonne `praticien_id` avant cette migration —
-- `USING(true)` permet donc à N'IMPORTE QUEL praticien authentifié de
-- modifier ou supprimer N'IMPORTE QUELLE ligne du catalogue commun.
--
-- Complément (ACL brute, aclexplode — relevé prod 2026-08-27) :
-- `authenticated` a un GRANT ALL sur cette table, TRUNCATE compris — un
-- privilège que RLS ne filtre JAMAIS, quelle que soit la qualité des
-- policies. Cette migration REVOKE explicitement TRUNCATE pour
-- `authenticated` ; `service_role` garde tous ses privilèges (rôle interne
-- de confiance).
--
-- Impact : aucune donnée de santé (catalogue de tests, pas de donnée
-- patient) — mais intégrité du catalogue partagé compromise pour tous les
-- praticiens si un seul altère ou supprime les entrées d'un autre.
--
-- Note sur `supprimer()` (src/hooks/useTm6Variantes.ts:44) : exporté par le
-- hook mais non appelé dans src/ (grep vérifié 2026-08-27) — la policy
-- DELETE est écrite par cohérence, pas parce que la fonctionnalité est
-- utilisée.
--
-- Vérifié sur staging par la séquence rouge/verte :
--   scripts/staging-restaurer-etat-prod-tm6.ts  (reproduit l'état de prod)
--   → tests/security/rls.spec.ts : [F-01] ÉCHOUE
--   → cette migration
--   → tests/security/rls.spec.ts : [F-01] PASSE, [F-09] reste vert,
--     et le nouveau test « creer() reste fonctionnel » (RÉG-01) passe.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────
-- Restaure l'état RÉEL d'avant ce correctif, tel que relevé en production
-- le 2026-08-27 (déconseillé — ça rouvre F-01). Note : `TO public` et
-- l'absence de WITH CHECK sur l'UPDATE sont volontaires, c'est l'état
-- constaté, pas une approximation.
--
--   DROP TRIGGER IF EXISTS trg_tm6_variantes_praticien_id ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_insert_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_update_tm6_variantes" ON public.tm6_variantes;
--   DROP POLICY IF EXISTS "praticien_delete_tm6_variantes" ON public.tm6_variantes;
--   GRANT TRUNCATE ON public.tm6_variantes TO authenticated;
--   ALTER TABLE public.tm6_variantes DROP COLUMN IF EXISTS praticien_id;
--   CREATE POLICY "praticien_select_tm6_variantes" ON public.tm6_variantes FOR SELECT TO public USING (true);
--   CREATE POLICY "praticien_insert_tm6_variantes" ON public.tm6_variantes FOR INSERT TO public WITH CHECK (true);
--   CREATE POLICY "praticien_update_tm6_variantes" ON public.tm6_variantes FOR UPDATE TO public USING (true);
--   CREATE POLICY "praticien_delete_tm6_variantes" ON public.tm6_variantes FOR DELETE TO public USING (true);
--   -- RLS reste activée : elle l'était déjà avant cette migration (cf. amendement 1).
--
-- ============================================================================

-- [F-09] Idempotent. Déjà vrai en production au 2026-08-27 (cf. amendement 1) ;
-- conservé pour un environnement neuf reconstruit depuis les migrations.
ALTER TABLE public.tm6_variantes ENABLE ROW LEVEL SECURITY;

-- [F-01] Propriétaire par ligne.
ALTER TABLE public.tm6_variantes
  ADD COLUMN IF NOT EXISTS praticien_id UUID REFERENCES public.praticiens(id) ON DELETE SET NULL;

-- ── Backfill du propriétaire ────────────────────────────────────────────
-- Sans ça, toute ligne existante resterait praticien_id NULL, donc en
-- lecture seule pour son propre auteur une fois les policies ci-dessous en
-- place (cf. amendement 3 : il n'y a pas d'entrées système dans cette base).
--
-- Le propriétaire est DÉDUIT des bilans qui référencent la variante — jamais
-- codé en dur : la migration doit rester rejouable sur un environnement neuf
-- où aucun de ces identifiants n'existe (la sous-requête y renvoie 0 ligne).
-- Déduction appliquée UNIQUEMENT si elle est sans ambiguïté : une variante
-- utilisée par plusieurs praticiens reste sans propriétaire (catalogue
-- partagé de fait — personne ne se l'approprie au détriment des autres).
--
-- La jointure sur `praticiens` n'est pas décorative : `bilans.praticien_id`
-- peut pointer vers un compte supprimé, ce qui ferait échouer la FK
-- `tm6_variantes.praticien_id -> praticiens(id)` et donc la migration entière.
--
-- Idempotent : `praticien_id IS NULL` fait de tout rejeu un no-op.
UPDATE public.tm6_variantes v
SET praticien_id = d.praticien_id
FROM (
  SELECT b.tm6_variante_id,
         (array_agg(DISTINCT b.praticien_id))[1] AS praticien_id
  FROM public.bilans b
  JOIN public.praticiens p ON p.id = b.praticien_id
  WHERE b.tm6_variante_id IS NOT NULL
  GROUP BY b.tm6_variante_id
  HAVING count(DISTINCT b.praticien_id) = 1
) d
WHERE v.id = d.tm6_variante_id
  AND v.praticien_id IS NULL;

-- Angle mort assumé et signalé plutôt que silencieux : une variante créée
-- mais JAMAIS utilisée dans un bilan n'a aucune source de déduction. Elle
-- reste sans propriétaire, donc en lecture seule pour `authenticated`
-- (modifiable via service_role uniquement). Aucune ligne dans ce cas en
-- production au 2026-08-27 (1 ligne, 1 bilan rattaché).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.tm6_variantes WHERE praticien_id IS NULL;
  IF n > 0 THEN
    RAISE NOTICE '[lot 8] % variante(s) sans proprietaire deductible : lecture seule pour authenticated, modifiables via service_role uniquement.', n;
  END IF;
END $$;

-- Même fonction que le reste du projet (set_praticien_id_from_auth,
-- voir supabase/schema.sql) : ne remplit praticien_id QUE s'il est encore
-- NULL, donc n'écrase jamais une valeur explicitement fournie — c'est la
-- policy WITH CHECK ci-dessous, pas ce trigger, qui empêche un praticien de
-- s'attribuer une ligne au nom de quelqu'un d'autre.
DROP TRIGGER IF EXISTS trg_tm6_variantes_praticien_id ON public.tm6_variantes;
CREATE TRIGGER trg_tm6_variantes_praticien_id
  BEFORE INSERT ON public.tm6_variantes
  FOR EACH ROW EXECUTE FUNCTION public.set_praticien_id_from_auth();

-- Lecture : reste ouverte à tout praticien connecté (catalogue de référence
-- partagé, aucune donnée de santé, aucune raison de cloisonner en lecture).
DROP POLICY IF EXISTS "praticien_select_tm6_variantes" ON public.tm6_variantes;
CREATE POLICY "praticien_select_tm6_variantes"
  ON public.tm6_variantes
  FOR SELECT
  TO authenticated
  USING (true);

-- Écriture : scopée au propriétaire — plus de USING(true)/WITH CHECK(true).
-- Une ligne appartenant à un autre praticien (ou sans propriétaire
-- déductible) n'est jamais modifiable/supprimable par `authenticated`
-- (NULL = auth.uid() n'est jamais vrai en SQL : protégé par construction,
-- pas par un cas particulier explicite).
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
