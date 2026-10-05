-- Facturation, étape 1 (2/5) : tables factures, lignes_facture, paiements et
-- compteurs_facture.
--
-- Principes
--  * Un praticien émet ses factures en son nom, avec sa propre numérotation :
--    RLS sur praticien_id = auth.uid(). L'admin applicatif lit tout (lecture seule).
--    Pas de policy « mode organisation » : une facture n'est jamais celle d'une
--    organisation.
--  * Aucune suppression en cascade vers une facture : contrat, bénéficiaire et
--    praticien sont en ON DELETE RESTRICT (pièces comptables, 10 ans). Supprimer
--    un contrat ou un bénéficiaire qui a des factures est donc refusé.
--  * Les montants d'un avoir sont stockés POSITIFS : le signe est porté par `type`.
--  * `numero` reste NULL tant que la facture est un brouillon et n'est posé que par
--    valider_facture() (migration 3/5). Les triggers de la migration 4/5 verrouillent
--    ensuite la facture.
--  * Unicité : au plus UNE facture « vivante » (brouillon ou émise, hors annulée)
--    par contrat et par mois — même idée que idx_factures_unique de factures_suivi,
--    étendue aux factures émises, pour qu'un brouillon ne double jamais une facture
--    déjà validée. Une facture annulée (par avoir) libère le mois.
--  * lignes_facture.tarif_contrat_id (en plus des colonnes demandées) : version de
--    tarif utilisée par la ligne. C'est ce qui permet de verrouiller une version de
--    tarifs_contrats « utilisée par une facture validée ».
--  * lignes_facture.seance_id : ON DELETE SET NULL, car seule une ligne de brouillon
--    peut rester sans séance (une séance facturée n'est pas supprimable, voir 4/5).
--
-- Privilèges : règle du 2026-08-29. REVOKE explicite de tout, puis GRANT ciblé.
-- En production, les privilèges par défaut de `postgres` donnent ALL à authenticated
-- et service_role sur toute nouvelle table : le REVOKE est indispensable.
--   factures, lignes_facture, paiements : SELECT/INSERT/UPDATE/DELETE à authenticated
--     (la RLS et les triggers bornent), ALL à service_role.
--   compteurs_facture : service_role seulement (jamais accessible au navigateur).

-- ---------- factures ----------
CREATE TABLE IF NOT EXISTS public.factures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                text,
  praticien_id          uuid NOT NULL REFERENCES public.praticiens(id)    ON DELETE RESTRICT,
  contrat_id            uuid NOT NULL REFERENCES public.contrats(id)      ON DELETE RESTRICT,
  participant_id        uuid NOT NULL REFERENCES public.participants(id)  ON DELETE RESTRICT,
  periode               date NOT NULL,
  type                  text NOT NULL DEFAULT 'facture',
  facture_origine_id    uuid REFERENCES public.factures(id) ON DELETE RESTRICT,
  statut                text NOT NULL DEFAULT 'brouillon',
  circuit               text NOT NULL DEFAULT 'classique',
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  part_client           numeric(12,2) NOT NULL DEFAULT 0,
  part_urssaf           numeric(12,2) NOT NULL DEFAULT 0,
  date_emission         date,
  echeance              date,
  snapshot_emetteur     jsonb,
  snapshot_destinataire jsonb,
  pdf_path              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factures_periode_premier_du_mois CHECK (extract(day FROM periode) = 1),
  CONSTRAINT factures_type_valide    CHECK (type IN ('facture', 'avoir')),
  CONSTRAINT factures_statut_valide  CHECK (statut IN ('brouillon','validee','envoyee','payee','en_retard','annulee')),
  CONSTRAINT factures_circuit_valide CHECK (circuit IN ('classique', 'urssaf')),
  CONSTRAINT factures_avoir_origine  CHECK ((type = 'avoir') = (facture_origine_id IS NOT NULL)),
  CONSTRAINT factures_montants_positifs CHECK (total >= 0 AND part_client >= 0 AND part_urssaf >= 0),
  CONSTRAINT factures_repartition_coherente CHECK (part_client + part_urssaf = total),
  CONSTRAINT factures_numero_format  CHECK (numero IS NULL OR numero ~ '^[0-9]{4}-[0-9]{4,}$'),
  CONSTRAINT factures_etat_emission CHECK (
    (statut = 'brouillon' AND numero IS NULL)
    OR (statut <> 'brouillon' AND numero IS NOT NULL AND date_emission IS NOT NULL
        AND echeance IS NOT NULL AND snapshot_emetteur IS NOT NULL AND snapshot_destinataire IS NOT NULL)
  ),
  CONSTRAINT factures_echeance_apres_emission CHECK (echeance IS NULL OR date_emission IS NULL OR echeance >= date_emission)
);

CREATE UNIQUE INDEX IF NOT EXISTS factures_numero_unique
  ON public.factures (praticien_id, numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS factures_une_vivante_par_contrat_periode
  ON public.factures (contrat_id, periode) WHERE type = 'facture' AND statut <> 'annulee';
CREATE INDEX IF NOT EXISTS factures_praticien_periode_idx ON public.factures (praticien_id, periode);
CREATE INDEX IF NOT EXISTS factures_participant_idx       ON public.factures (participant_id);
CREATE INDEX IF NOT EXISTS factures_origine_idx           ON public.factures (facture_origine_id) WHERE facture_origine_id IS NOT NULL;

DROP TRIGGER IF EXISTS factures_updated_at ON public.factures;
CREATE TRIGGER factures_updated_at BEFORE UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- lignes_facture ----------
CREATE TABLE IF NOT EXISTS public.lignes_facture (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id       uuid NOT NULL REFERENCES public.factures(id)        ON DELETE CASCADE,
  seance_id        uuid REFERENCES public.seances(id)                  ON DELETE SET NULL,
  tarif_contrat_id uuid REFERENCES public.tarifs_contrats(id)          ON DELETE SET NULL,
  libelle          text NOT NULL,
  quantite         numeric(10,2) NOT NULL,
  prix_unitaire    numeric(12,2) NOT NULL,
  montant          numeric(12,2) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lignes_facture_libelle_non_vide CHECK (nullif(btrim(libelle), '') IS NOT NULL),
  CONSTRAINT lignes_facture_quantite_positive CHECK (quantite > 0),
  CONSTRAINT lignes_facture_prix_positif CHECK (prix_unitaire >= 0),
  CONSTRAINT lignes_facture_montant_coherent CHECK (montant = round(quantite * prix_unitaire, 2))
);
CREATE INDEX IF NOT EXISTS lignes_facture_facture_idx ON public.lignes_facture (facture_id);
CREATE INDEX IF NOT EXISTS lignes_facture_seance_idx  ON public.lignes_facture (seance_id) WHERE seance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lignes_facture_tarif_idx   ON public.lignes_facture (tarif_contrat_id) WHERE tarif_contrat_id IS NOT NULL;

-- ---------- paiements ----------
CREATE TABLE IF NOT EXISTS public.paiements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.factures(id) ON DELETE RESTRICT,
  date       date NOT NULL,
  montant    numeric(12,2) NOT NULL,
  moyen      text NOT NULL,
  source     text NOT NULL DEFAULT 'manuel',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paiements_montant_positif CHECK (montant > 0),
  CONSTRAINT paiements_moyen_valide  CHECK (moyen IN ('virement','cheque','especes','carte','prelevement','autre')),
  CONSTRAINT paiements_source_valide CHECK (source IN ('manuel', 'urssaf'))
);
CREATE INDEX IF NOT EXISTS paiements_facture_idx ON public.paiements (facture_id);

-- ---------- compteurs_facture (numérotation, voir 3/5) ----------
CREATE TABLE IF NOT EXISTS public.compteurs_facture (
  praticien_id   uuid NOT NULL REFERENCES public.praticiens(id) ON DELETE RESTRICT,
  annee          integer NOT NULL,
  dernier_numero integer NOT NULL DEFAULT 0,
  PRIMARY KEY (praticien_id, annee),
  CONSTRAINT compteurs_facture_positif CHECK (dernier_numero >= 0),
  CONSTRAINT compteurs_facture_annee_valide CHECK (annee BETWEEN 2000 AND 2999)
);

-- ---------- RLS ----------
ALTER TABLE public.factures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lignes_facture    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compteurs_facture ENABLE ROW LEVEL SECURITY;  -- aucune policy : inaccessible au navigateur

DROP POLICY IF EXISTS "factures_praticien" ON public.factures;
CREATE POLICY "factures_praticien" ON public.factures
  FOR ALL TO authenticated
  USING (praticien_id = auth.uid())
  WITH CHECK (
    praticien_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = participant_id AND p.praticien_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contrats c WHERE c.id = contrat_id AND c.participant_id = participant_id)
  );

DROP POLICY IF EXISTS "factures_admin_lecture" ON public.factures;
CREATE POLICY "factures_admin_lecture" ON public.factures
  FOR SELECT TO authenticated USING (public.app_role_courant() = 'admin');

DROP POLICY IF EXISTS "lignes_facture_praticien" ON public.lignes_facture;
CREATE POLICY "lignes_facture_praticien" ON public.lignes_facture
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.factures f WHERE f.id = facture_id AND f.praticien_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.factures f WHERE f.id = facture_id AND f.praticien_id = auth.uid()));

DROP POLICY IF EXISTS "lignes_facture_admin_lecture" ON public.lignes_facture;
CREATE POLICY "lignes_facture_admin_lecture" ON public.lignes_facture
  FOR SELECT TO authenticated USING (public.app_role_courant() = 'admin');

DROP POLICY IF EXISTS "paiements_praticien" ON public.paiements;
CREATE POLICY "paiements_praticien" ON public.paiements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.factures f WHERE f.id = facture_id AND f.praticien_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.factures f WHERE f.id = facture_id AND f.praticien_id = auth.uid()));

DROP POLICY IF EXISTS "paiements_admin_lecture" ON public.paiements;
CREATE POLICY "paiements_admin_lecture" ON public.paiements
  FOR SELECT TO authenticated USING (public.app_role_courant() = 'admin');

-- ---------- Privilèges (règle du 2026-08-29) ----------
REVOKE ALL ON TABLE public.factures, public.lignes_facture, public.paiements, public.compteurs_facture FROM PUBLIC;
REVOKE ALL ON TABLE public.factures, public.lignes_facture, public.paiements, public.compteurs_facture FROM anon;
REVOKE ALL ON TABLE public.factures, public.lignes_facture, public.paiements, public.compteurs_facture FROM authenticated;
REVOKE ALL ON TABLE public.factures, public.lignes_facture, public.paiements, public.compteurs_facture FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.factures       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lignes_facture TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paiements      TO authenticated;
GRANT ALL ON TABLE public.factures, public.lignes_facture, public.paiements, public.compteurs_facture TO service_role;

DO $controle$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['factures','lignes_facture','paiements','compteurs_facture'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Facturation 2/5 : table % absente', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'Facturation 2/5 : RLS désactivée sur %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'Facturation 2/5 : anon a des privilèges sur %', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRIGGER') THEN
      RAISE EXCEPTION 'Facturation 2/5 : authenticated a des privilèges superflus sur %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Facturation 2/5 : service_role privé de droits sur %', t;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.compteurs_facture', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Facturation 2/5 : compteurs_facture ne doit pas être accessible à authenticated';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND tablename IN ('factures','lignes_facture','paiements')) <> 6 THEN
    RAISE EXCEPTION 'Facturation 2/5 : 6 policies attendues sur factures/lignes/paiements';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compteurs_facture') THEN
    RAISE EXCEPTION 'Facturation 2/5 : compteurs_facture ne doit avoir aucune policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'factures_une_vivante_par_contrat_periode' AND indexdef LIKE 'CREATE UNIQUE%') THEN
    RAISE EXCEPTION 'Facturation 2/5 : index d''unicité contrat/période absent';
  END IF;
END
$controle$;
