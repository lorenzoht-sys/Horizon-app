-- Raison d'annulation (facultative) sur une séance — donnée interne au
-- praticien, jamais renvoyée à l'espace bénéficiaire (voir api/patient/me.ts,
-- qui sélectionne désormais une liste de colonnes explicite excluant
-- celles-ci plutôt que select('*')).
--
-- motif_annulation_detail n'est renseigné que lorsque motif_annulation = 'autre'.

ALTER TABLE seances
  ADD COLUMN IF NOT EXISTS motif_annulation TEXT
    CHECK (motif_annulation IN (
      'maladie', 'vacances', 'rdv_medical', 'indisponibilite_personnelle',
      'transport', 'meteo', 'hospitalisation', 'autre'
    )),
  ADD COLUMN IF NOT EXISTS motif_annulation_detail TEXT;
