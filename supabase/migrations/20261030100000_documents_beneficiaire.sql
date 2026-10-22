-- Documents du bénéficiaire (point D, étape D1, décisions du 2026-10-22).
--
-- 1. praticiens.factures_proche_visibles : quand un PROCHE paie, le bénéficiaire voit-il quand même la
--    facture dans son espace ? Par défaut OUI (true) ; Lorenzo le fait confirmer par Pierre. Une facture
--    adressée au bénéficiaire lui-même lui est toujours visible : le réglage ne porte que sur le cas du
--    proche payeur.
-- 2. documents_du_beneficiaire(participant) : les factures et avoirs ÉMIS (jamais un brouillon) que le
--    bénéficiaire voit, avec la règle ci-dessus. Le payeur est celui FIGÉ dans la facture
--    (snapshot_destinataire.role, posé par valider_facture), pas celui du contrat aujourd'hui : changer de
--    payeur sur le contrat ne fait ni apparaître ni disparaître une facture déjà émise.
--    Réservée à service_role : elle sert à api/patient/me.ts (D2), dont la session patient n'a pas de
--    jeton Supabase. Aucune exécution pour anon ni authenticated : un praticien lit ses factures sous sa
--    propre RLS, et la même règle est rejouée côté écran (src/lib/documentsBeneficiaire.ts), contrôlée
--    contre cette fonction par tests/db/documents-beneficiaire.spec.ts.
--
-- Privilèges : aucune table créée ; la colonne suit les droits et la RLS existants de praticiens.

-- ---------- 1. réglage ----------
ALTER TABLE public.praticiens ADD COLUMN IF NOT EXISTS factures_proche_visibles boolean NOT NULL DEFAULT true;

-- ---------- 2. factures visibles du bénéficiaire ----------
CREATE OR REPLACE FUNCTION public.documents_du_beneficiaire(p_participant_id uuid)
RETURNS TABLE (
  id uuid,
  type text,
  numero text,
  periode date,
  date_emission date,
  total numeric,
  statut text,
  pdf_path text,
  payeur_proche boolean
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT f.id, f.type, f.numero, f.periode, f.date_emission, f.total, f.statut, f.pdf_path,
         coalesce(f.snapshot_destinataire->>'role', '') = 'proche' AS payeur_proche
    FROM public.factures f
    JOIN public.praticiens p ON p.id = f.praticien_id
   WHERE f.participant_id = p_participant_id
     AND f.statut <> 'brouillon'
     AND f.numero IS NOT NULL
     AND (coalesce(f.snapshot_destinataire->>'role', '') <> 'proche' OR p.factures_proche_visibles)
   ORDER BY f.date_emission DESC, f.numero DESC;
$$;

REVOKE ALL ON FUNCTION public.documents_du_beneficiaire(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.documents_du_beneficiaire(uuid) TO service_role;

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'praticiens' AND column_name = 'factures_proche_visibles'
                   AND is_nullable = 'NO' AND data_type = 'boolean' AND column_default = 'true') THEN
    RAISE EXCEPTION 'Documents : praticiens.factures_proche_visibles absente ou mal définie';
  END IF;
  IF to_regprocedure('public.documents_du_beneficiaire(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Documents : fonction documents_du_beneficiaire absente';
  END IF;
  IF has_function_privilege('anon', 'public.documents_du_beneficiaire(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.documents_du_beneficiaire(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Documents : documents_du_beneficiaire exécutable par anon ou authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.documents_du_beneficiaire(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Documents : documents_du_beneficiaire non exécutable par service_role';
  END IF;
END
$controle$;
