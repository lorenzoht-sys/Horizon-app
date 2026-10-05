-- Retrait de la clé `progression` de participants.visibilite_beneficiaire.
-- Reprise corrigée de 20260914_retrait_visibilite_progression.sql (archive),
-- jamais appliquée en production.
--
-- Pourquoi retirer la clé : elle ne pilotait que l'affichage de l'onglet
-- « Progrès » de l'espace bénéficiaire, sans commander aucune donnée ; le contenu
-- de l'onglet dépend de bilans.visible_beneficiaire (inchangé, caché par
-- défaut). Plus aucun code ne la lit (api/patient/me.ts, src/types/index.ts,
-- src/lib/mappers.ts).
--
-- Correction de l'ancienne version : son SET DEFAULT réécrivait le défaut sans
-- `messagePraticien`, ajouté entre-temps par 20260831. Un nouveau bénéficiaire
-- aurait alors perdu cette clé (repli code : « visible »). Le défaut ci-dessous
-- reprend celui de la production (relevé du 2026-10-05) et ne retire QUE
-- `progression`. `messagePierre` reste volontairement : sa suppression est une
-- migration distincte, à passer une fois le nouveau code déployé (voir 20260831).
--
-- Effet sur les données : retire `progression` des lignes qui l'ont (11 sur 41 au
-- 2026-10-05). Le trigger participants_updated_at met à jour updated_at de ces
-- lignes. Aucun partage n'est créé ni retiré.
--
-- Idempotent : `-` sur une clé absente ne fait rien ; SET DEFAULT réécrit la
-- même valeur. Aucune nouvelle table.

ALTER TABLE public.participants
  ALTER COLUMN visibilite_beneficiaire SET DEFAULT
    '{"rdv": true, "bilans": true, "programme": true, "carteSante": true, "messagePierre": true, "messagePraticien": true}'::jsonb;

UPDATE public.participants
SET visibilite_beneficiaire = visibilite_beneficiaire - 'progression'
WHERE visibilite_beneficiaire ? 'progression';

DO $controle$
DECLARE v_def text; v_restants int;
BEGIN
  SELECT column_default INTO v_def FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'participants' AND column_name = 'visibilite_beneficiaire';
  IF v_def LIKE '%progression%' OR v_def NOT LIKE '%messagePraticien%' OR v_def NOT LIKE '%messagePierre%'
     OR v_def NOT LIKE '%carteSante%' OR v_def NOT LIKE '%programme%' OR v_def NOT LIKE '%bilans%' OR v_def NOT LIKE '%rdv%' THEN
    RAISE EXCEPTION 'visibilite_beneficiaire : défaut inattendu (%)', v_def;
  END IF;
  SELECT count(*) INTO v_restants FROM public.participants WHERE visibilite_beneficiaire ? 'progression';
  IF v_restants <> 0 THEN
    RAISE EXCEPTION 'visibilite_beneficiaire : % ligne(s) portent encore progression', v_restants;
  END IF;
END
$controle$;
