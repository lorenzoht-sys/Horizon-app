// Colonnes de `seances` qu'une route peut renvoyer à quelqu'un d'AUTRE que le
// praticien : le bénéficiaire (api/patient/me.ts) et le portail structure
// (api/structure/data.ts). Une seule liste pour les deux, volontairement.
//
// EXCLUES, données internes au praticien :
//   - notes : texte libre saisi par le praticien (« Observations rapides… » à
//     la création d'une séance). Il contenait des remarques sur la personne :
//     17 notes libres étaient renvoyées au navigateur du bénéficiaire, dont 2
//     au portail structure (constaté en production le 2026-09-21). Aucun écran
//     ne les affichait — elles voyageaient dans la réponse réseau.
//   - motif_annulation, motif_annulation_detail : idem, voir
//     supabase/migrations/20260708_motif_annulation_seances.sql.
//
// Même règle que le flux ICS (api/_lib/planningIcs.ts) : jamais de notes.
//
// Ajouter une colonne ici, c'est la publier à des tiers : la liste est
// fermée, et api/_lib/colonnesSeancesExposees.test.ts refuse les colonnes
// internes. Ne jamais la remplacer par select('*').
export const COLONNES_SEANCE_EXPOSEE = [
  'id', 'participant_id', 'contrat_id', 'date', 'heure_debut', 'heure_fin',
  'duree_minutes', 'type', 'statut', 'adresse', 'coordonnees',
  'created_at', 'updated_at',
].join(', ');
