-- Suppression d'un bénéficiaire : bloquée dès qu'il existe un historique financier (décision du 2026-10-20).
--
-- Constat (état des lieux de la facturation, 2026-10-20) :
--   * le bouton « Supprimer » de la fiche ignorait l'erreur de la base : quand la suppression était refusée
--     (factures en RESTRICT), la fiche disparaissait quand même de la liste jusqu'au rechargement ;
--   * sans facture, la suppression emportait en cascade les saisies de CA externe (`ca_externe`, créé en
--     ON DELETE CASCADE par la migration 20261012100000), c'est-à-dire une partie de l'historique financier.
--
-- Décision : la suppression est refusée dès qu'il existe un historique financier, factures (brouillons
-- compris), avoirs ou CA externe. Il faut archiver le bénéficiaire à la place.
--
-- 1. ca_externe.participant_id passe de ON DELETE CASCADE à ON DELETE RESTRICT (factures et avoirs l'étaient
--    déjà). Défense en profondeur : la base refuse quel que soit l'appelant.
-- 2. Un trigger BEFORE DELETE sur participants refuse la suppression AVANT toute cascade, avec un message
--    clair et compté que l'interface affiche tel quel. Sans lui, le refus serait le message technique d'une
--    contrainte de clé étrangère. Il compte toutes les lignes quel que soit l'appelant (SECURITY DEFINER),
--    et n'expose que des nombres.
--
-- Rien d'autre ne change : un bénéficiaire sans historique financier se supprime comme avant (cascade sur ses
-- bilans, programmes, séances, documents…). Aucune donnée existante n'est touchée.

-- ---------- 1. ca_externe : plus de suppression en cascade ----------
ALTER TABLE public.ca_externe DROP CONSTRAINT IF EXISTS ca_externe_participant_id_fkey;
ALTER TABLE public.ca_externe
  ADD CONSTRAINT ca_externe_participant_id_fkey
  FOREIGN KEY (participant_id) REFERENCES public.participants(id) ON DELETE RESTRICT;

-- ---------- 2. refus explicite avant toute cascade ----------
CREATE OR REPLACE FUNCTION public.participants_suppression_si_sans_historique_financier()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_factures integer;
  v_avoirs   integer;
  v_externe  integer;
BEGIN
  SELECT count(*) FILTER (WHERE type = 'facture'), count(*) FILTER (WHERE type = 'avoir')
    INTO v_factures, v_avoirs
    FROM public.factures WHERE participant_id = OLD.id;
  SELECT count(*) INTO v_externe FROM public.ca_externe WHERE participant_id = OLD.id;

  IF v_factures + v_avoirs + v_externe > 0 THEN
    RAISE EXCEPTION 'Ce bénéficiaire a un historique financier (% facture(s), % avoir(s), % saisie(s) de CA externe) : il ne peut pas être supprimé. Archivez-le à la place.',
      v_factures, v_avoirs, v_externe
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.participants_suppression_si_sans_historique_financier() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS participants_suppression_si_sans_historique_financier ON public.participants;
CREATE TRIGGER participants_suppression_si_sans_historique_financier
  BEFORE DELETE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.participants_suppression_si_sans_historique_financier();

-- ---------- contrôle final ----------
DO $controle$
BEGIN
  IF (SELECT confdeltype FROM pg_constraint WHERE conname = 'ca_externe_participant_id_fkey'
        AND conrelid = 'public.ca_externe'::regclass) IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'Suppression protégée : ca_externe_participant_id_fkey n''est pas en ON DELETE RESTRICT';
  END IF;
  -- Les factures (et donc les avoirs) doivent rester en RESTRICT vers le bénéficiaire et le contrat.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.factures'::regclass AND contype = 'f'
                AND confrelid IN ('public.participants'::regclass, 'public.contrats'::regclass)
                AND confdeltype <> 'r') THEN
    RAISE EXCEPTION 'Suppression protégée : une clé étrangère de factures vers participants ou contrats n''est plus en RESTRICT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'participants_suppression_si_sans_historique_financier'
                   AND tgrelid = 'public.participants'::regclass AND NOT tgisinternal AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'Suppression protégée : trigger absent ou désactivé';
  END IF;
  IF has_function_privilege('anon', 'public.participants_suppression_si_sans_historique_financier()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.participants_suppression_si_sans_historique_financier()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Suppression protégée : fonction du trigger exécutable par anon ou authenticated';
  END IF;
END
$controle$;
