# Cartographie des données d'Horizon (générée)

Générée par `node scripts/cartographie.mjs` le 2026-11-11.
Ne pas modifier à la main : relancer le script après chaque chantier.

## Chiffres clés

| Élément | Nombre |
| --- | --- |
| Fichiers du front (hors tests) | 264 (64 966 lignes) |
| Routes API (`api/`) | 12 |
| Edge Functions | 3 |
| Tables (schéma public) | 62 |
| Tables lues ou écrites directement par le front | 47 |
| Fonctions SQL appelées en RPC par le front | 8 |
| Tests unitaires | 91 fichiers |
| Scénarios e2e | 39 fichiers |

## Table par table

Colonne « Front » : fichiers qui lisent ou écrivent la table via `supabase.from()`
(PostgREST, protégé par la RLS). Colonne « Serveur » : routes `api/` et Edge
Functions (clé `service_role`, RLS contournée : le contrôle est dans le code).

| Table | Politiques RLS | Triggers | Front | Serveur |
| --- | --- | --- | --- | --- |
| `assistant_logs` | 0 | 1 | pages/AssistantPage, pages/mobile/AppMobile | — |
| `audit_logs` | 2 | 1 | — | api/_lib/patientAuth |
| `bilans` | 5 | 2 | hooks/useParticipants, pages/SettingsPage | api/patient/me |
| `bilans_auto` | 1 | 2 | hooks/useBilansAuto | — |
| `bilans_brouillons` | 1 | 0 | hooks/useBrouillonBilan | — |
| `ca_externe` | 1 | 1 | hooks/useChiffreAffaires | — |
| `categories_seance` | 1 | 2 | hooks/useCategoriesSeance | — |
| `claude_rate_limit` | 0 | 0 | — | api/_lib/rateLimit |
| `comptes_rendus_seances` | 5 | 2 | hooks/useCompteRenduSeance, pages/AssistantPage | — |
| `compteurs_facture` | 0 | 0 | — | — |
| `contrats` | 5 | 2 | components/participant/SectionPayeurContrat, hooks/useContrats | api/_lib/facturationMensuelle, api/_lib/renouvellementContrats, api/seances/supprimer-planifiees, supabase/functions/facturation-envoi/index |
| `cours_collectifs` | 2 | 0 | hooks/useCoursCollectifs | api/_lib/planningIcs |
| `documents_partages` | 1 | 0 | pages/AssistantPage | api/structure/data |
| `documents_patient` | 2 | 1 | hooks/useDocumentsBeneficiaire, pages/AssistantPage | api/patient/me |
| `dossier_exercice_membres` | 1 | 0 | data/exercices | — |
| `dossiers_exercices` | 1 | 0 | data/exercices | — |
| `envois_factures` | 1 | 1 | — | supabase/functions/facturation-envoi/index |
| `evenements_agenda` | 4 | 2 | hooks/useEvenementsAgenda | api/_lib/planningIcs |
| `exercices_libres_activations` | 2 | 0 | hooks/useActivitesHorsProgramme | api/patient/activite, api/patient/me |
| `exercices_libres_validations` | 2 | 0 | hooks/useActivitesHorsProgramme | api/patient/activite, api/patient/me |
| `exercices_personnalises` | 1 | 0 | data/exercices | — |
| `exercices_realises` | 4 | 0 | lib/suiviBeneficiaire, pages/AssistantPage | api/patient/me, api/patient/seance |
| `factures` | 2 | 11 | hooks/useDocumentsBeneficiaire, hooks/useFacturesAValider | api/_lib/facturationMensuelle, supabase/functions/facturation-envoi/index, supabase/functions/facturation-pdf/index |
| `factures_suivi` | 1 | 0 | hooks/useFactures | api/structure/data |
| `indisponibilites` | 4 | 1 | hooks/useIndispos, pages/SettingsPage | — |
| `lignes_facture` | 2 | 1 | hooks/useFacturesAValider | supabase/functions/facturation-pdf/index |
| `logos_factures` | 0 | 1 | — | supabase/functions/facturation-pdf/index |
| `notes_seances` | 5 | 2 | hooks/useJournalSeance, pages/AssistantPage | — |
| `organisation_demande_attempts` | 0 | 0 | — | api/organisation |
| `organisation_invitations` | 2 | 0 | — | — |
| `organisation_membres` | 4 | 0 | — | — |
| `organisations` | 2 | 0 | — | api/organisation |
| `paiements` | 4 | 3 | — | — |
| `participants` | 5 | 5 | hooks/useChiffreAffaires, hooks/useParticipants, hooks/useSuiviSeances, pages/SettingsPage | api/_lib/participantsArchives, api/_lib/patientSession, api/_lib/renouvellementContrats, api/patient/activite, api/patient/me, api/patient/retour-seance, api/structure/data, supabase/functions/facturation-envoi/index |
| `participations_cours_collectifs` | 2 | 0 | hooks/useCoursCollectifs | api/_lib/coursPatient, api/patient/activite |
| `patient_activite_rate_limit` | 0 | 0 | — | api/_lib/activiteRateLimit |
| `patient_login_attempts` | 0 | 0 | — | api/_lib/patientAuth |
| `praticien_push_subscriptions` | 4 | 0 | lib/praticienPush | api/_lib/notifications |
| `praticiens` | 4 | 2 | App, components/layout/Sidebar, hooks/useDocumentsBeneficiaire, hooks/useFacturesAValider, hooks/useProfilFacturation, lib/settingsPraticien, pages/OnboardingPage, pages/RegisterPage, pages/SettingsPage | api/_lib/planningIcs, api/organisation, api/patient/me, api/structure/data |
| `programme_exercices` | 3 | 0 | hooks/useProgrammeV2, pages/AssistantPage | api/patient/me, api/patient/seance |
| `programme_modele_exercices` | 1 | 0 | hooks/useProgrammesModeles | — |
| `programme_modele_planning` | 1 | 0 | hooks/useProgrammesModeles | — |
| `programme_modele_seances` | 1 | 0 | hooks/useProgrammesModeles | — |
| `programme_planning` | 3 | 0 | hooks/useProgrammeV2, pages/AssistantPage | api/patient/me |
| `programme_seances` | 3 | 0 | hooks/useProgrammeV2, pages/AssistantPage | api/patient/me, api/patient/seance |
| `programmes` | 5 | 2 | hooks/useProgramme, hooks/useProgrammeV2, pages/AssistantPage, pages/SettingsPage | api/patient/me, api/patient/seance |
| `programmes_modeles` | 1 | 2 | hooks/useProgrammesModeles | — |
| `push_subscriptions` | 2 | 0 | lib/suiviBeneficiaire | api/_lib/notifications, api/patient/push-subscribe |
| `rappel_preferences` | 1 | 2 | hooks/useRappelPreferences | api/cron/rappels |
| `rappels_envoyes` | 2 | 0 | — | api/cron/rappels |
| `retours_seance` | 2 | 0 | lib/suiviBeneficiaire | api/patient/retour-seance |
| `seances` | 5 | 7 | hooks/useAgenda, lib/liaisonSeanceBilan, pages/AssistantPage | api/_lib/planningIcs, api/_lib/renouvellementContrats, api/cron/rappels, api/patient/activite, api/patient/me, api/seances/supprimer-planifiees, api/structure/data |
| `seances_patient` | 4 | 0 | hooks/useProgrammeV2, lib/suiviBeneficiaire, pages/AssistantPage | api/patient/me, api/patient/retour-seance, api/patient/seance |
| `structure_access_logs` | 1 | 0 | — | api/_lib/structureAuth |
| `structures` | 1 | 0 | hooks/useStructures, pages/StructureDetail | api/_lib/structureAuth |
| `tarifs_contrats` | 2 | 4 | hooks/useTarifsContrat | — |
| `templates_structure` | 1 | 0 | hooks/useTemplatesStructure | — |
| `tests_etalons_activations` | 2 | 0 | hooks/useActivitesHorsProgramme | api/patient/activite, api/patient/me |
| `tests_etalons_resultats` | 2 | 0 | hooks/useActivitesHorsProgramme | api/patient/activite, api/patient/me |
| `tm6_variantes` | 4 | 1 | hooks/useTm6Variantes | — |
| `user_roles` | 1 | 0 | — | api/_lib/adminAuth, api/organisation |
| `zones_geographiques` | 4 | 2 | hooks/useZones | — |

## Fonctions SQL appelées en RPC

| Fonction | Appelée depuis |
| --- | --- |
| `acces_participant_pour` | api/_lib/patientSession |
| `actualiser_statuts_factures` | api/_lib/facturationMensuelle |
| `app_role_courant` | hooks/useAppRole |
| `chiffre_affaires_mensuel` | hooks/useChiffreAffaires |
| `creer_avoir` | hooks/useFacturesAValider |
| `documents_du_beneficiaire` | api/_lib/facturesPatient |
| `dupliquer_programme_modele` | hooks/useProgrammesModeles |
| `generer_brouillon_facture` | hooks/useFacturesAValider, api/_lib/facturationMensuelle |
| `marquer_facture_payee` | hooks/useFacturesAValider |
| `suivi_facturation_seances` | hooks/useSuiviSeances |
| `valider_facture` | hooks/useFacturesAValider, pages/FacturesAValiderPage |

## Accès directs par couche du front

Plus les accès sont regroupés dans `hooks/`, plus un changement de source de données est localisé.

| Couche | Fichiers avec accès direct | Appels `.from()` |
| --- | --- | --- |
| `src/hooks/` | 27 | 149 |
| `src/pages/` | 6 | 29 |
| `src/components/` | 2 | 3 |
| `src/lib/` | 4 | 11 |
| `src/data/` | 1 | 9 |
| `src/utils/` | 0 | 0 |

Appels à Supabase Auth (`supabase.auth.*`) : `App`, `lib/session`, `lib/settingsPraticien`, `lib/supabase`, `pages/ForgotPasswordPage`, `pages/LoginPage`, `pages/RegisterPage`, `pages/ResetPasswordPage`.

## Routes serveur

Les tables d'une route incluent celles de ses helpers `api/_lib/` importés, comptés au niveau du fichier : la liste peut être un peu plus large que ce que la route utilise réellement.

| Route | Tables | RPC | Services externes |
| --- | --- | --- | --- |
| `/api/claude` | audit_logs, claude_rate_limit, patient_login_attempts | — | api.anthropic.com |
| `/api/cron/rappels` | audit_logs, contrats, factures, participants, patient_login_attempts, praticien_push_subscriptions, push_subscriptions, rappel_preferences, rappels_envoyes, seances | actualiser_statuts_factures, generer_brouillon_facture | — |
| `/api/organisation` | audit_logs, organisation_demande_attempts, organisations, patient_login_attempts, praticiens, user_roles | — | — |
| `/api/patient/activite` | audit_logs, exercices_libres_activations, exercices_libres_validations, participants, participations_cours_collectifs, patient_activite_rate_limit, patient_login_attempts, praticien_push_subscriptions, push_subscriptions, seances, tests_etalons_activations, tests_etalons_resultats | documents_du_beneficiaire | — |
| `/api/patient/me` | audit_logs, bilans, documents_patient, exercices_libres_activations, exercices_libres_validations, exercices_realises, participants, participations_cours_collectifs, patient_login_attempts, praticiens, programme_exercices, programme_planning, programme_seances, programmes, seances, seances_patient, tests_etalons_activations, tests_etalons_resultats | documents_du_beneficiaire | — |
| `/api/patient/push-subscribe` | audit_logs, patient_login_attempts, push_subscriptions | — | — |
| `/api/patient/retour-seance` | audit_logs, participants, patient_login_attempts, retours_seance, seances_patient | — | — |
| `/api/patient/seance` | audit_logs, exercices_realises, patient_login_attempts, programme_exercices, programme_seances, programmes, seances_patient | — | — |
| `/api/patient/session` | audit_logs, participants, patient_login_attempts | acces_participant_pour | — |
| `/api/planning/ics` | audit_logs, cours_collectifs, evenements_agenda, patient_login_attempts, praticiens, seances | — | — |
| `/api/seances/supprimer-planifiees` | audit_logs, contrats, patient_login_attempts, seances | — | — |
| `/api/structure/data` | audit_logs, documents_partages, factures_suivi, participants, patient_login_attempts, praticiens, seances, structure_access_logs, structures | — | — |

## Edge Functions

| Fonction | Tables | Services externes |
| --- | --- | --- |
| `analyser-seance` | — | api.anthropic.com |
| `facturation-envoi` | contrats, envois_factures, factures, participants | app.horizon-suivi.fr, api.resend.com |
| `facturation-pdf` | factures, lignes_facture, logos_factures | — |

## Services externes appelés depuis le navigateur

| Hôte | Fichiers |
| --- | --- |
| api-adresse.data.gouv.fr | utils/geocodeAdresse |
| img.youtube.com | pages/ExercicesPage, programme/ExerciceCard |
| maps.google.com | pages/ParticipantProfile |
| unpkg.com | pages/ZonesPage |
| www.google.com | pages/mobile/AppMobile |
| www.openstreetmap.org | components/map/MapView, pages/ZonesPage |
| www.youtube-nocookie.com | components/YoutubePlayer |
| youtu.be | utils/exportPDF |

## Fichiers les plus lourds (plus de 800 lignes)

Ce sont les zones où une modification a le plus de chances d'avoir des effets de bord.

| Fichier | Lignes | Tables touchées directement |
| --- | --- | --- |
| `src/pages/EspacePatient.tsx` | 3 090 | — |
| `src/pages/ParticipantProfile.tsx` | 2 422 | — |
| `src/components/participant/ParticipantForm.tsx` | 2 371 | — |
| `src/data/exercices.ts` | 2 301 | exercices_personnalises, dossiers_exercices, dossier_exercice_membres |
| `src/pages/mobile/AppMobile.tsx` | 2 284 | assistant_logs |
| `src/pages/StatsPage.tsx` | 1 532 | — |
| `src/pages/AssistantPage.tsx` | 1 277 | seances, comptes_rendus_seances, documents_patient, notes_seances, programmes, programme_seances, programme_planning, programme_exercices, seances_patient, exercices_realises, assistant_logs, documents_partages |
| `src/pages/SettingsPage.tsx` | 1 226 | praticiens, participants, indisponibilites, bilans, programmes |
| `src/types/index.ts` | 1 211 | — |
| `src/components/programme/ProgrammeWizard.tsx` | 1 023 | — |
| `src/pages/AgendaV2Page.tsx` | 1 022 | — |
| `src/data/exercicesMouvApa.ts` | 943 | — |
| `src/pages/PortailStructure.tsx` | 893 | — |
| `src/components/participant/ContratsTab.tsx` | 890 | — |
| `src/components/bilan/FormulaireBilanInitial.tsx` | 812 | — |
| `src/pages/ExercicesPage.tsx` | 812 | — |

## Couverture de tests

- 91 fichiers de tests unitaires (Vitest), 39 scénarios e2e (Playwright), plus le harnais RLS (`tests/security/`).
- Modules de `src/lib/` sans test unitaire à côté (9 sur 52) : `lib/analyse-tournee`, `lib/anamnese`, `lib/liaisonSeanceBilan`, `lib/libellesBibliotheque`, `lib/patientApi`, `lib/push`, `lib/sentry`, `lib/settingsPraticien`, `lib/structureApi`.
