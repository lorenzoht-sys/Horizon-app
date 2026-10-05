-- ============================================================================
-- 20260820_add_infos_complementaires_participants.sql
-- ============================================================================
--
-- Ajoute deux champs pratiques, optionnels, à la fiche bénéficiaire :
--   - code_portail    : code d'accès physique au domicile (digicode, portail).
--                       Distinct de `code_acces` (code de connexion à
--                       l'espace bénéficiaire /patient, voir
--                       20260614_add_code_acces_participants.sql) — les deux
--                       n'ont rien en commun, noms choisis pour ne pas se
--                       confondre.
--   - personne_contact : texte libre "Nom + téléphone" de la personne à
--                       contacter sur place si besoin (pas de table dédiée,
--                       un seul champ suffit pour l'instant).
--
-- Ces deux champs sont repris dans le DESCRIPTION de l'export ICS du planning
-- (api/_lib/planningIcs.ts) quand ils sont renseignés — jamais les notes ou
-- motifs d'annulation, qui restent exclus comme avant.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS code_portail text,
  ADD COLUMN IF NOT EXISTS personne_contact text;
