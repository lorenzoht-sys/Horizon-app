# Audit des 12 routes API — preuve ligne par ligne

Contre-vérification de l'affirmation "auth/IDOR/405 déjà corrects sur les
12 routes, vérifié pas supposé" (session du 2026-08-19, LOT B). Chaque
ligne ci-dessous a été relue dans le fichier au moment de l'écriture de ce
document — pas de reconstruction de mémoire. Colonnes :

- **Identité** : fichier:ligne où l'appelant est authentifié de façon
  vérifiable (JWT décodé/validé, token comparé en base, secret comparé en
  temps constant) — pas une simple présence de header.
- **Anti-IDOR** : fichier:ligne où un identifiant fourni par le client
  (autre que l'identité elle-même) est vérifié comme appartenant à
  l'appelant avant lecture/écriture. "Aucun identifiant externe utilisé"
  = la route n'accepte aucun id référençant une ressource d'un tiers, donc
  la question ne se pose pas (pas un chèque en blanc — vérifié champ par
  champ, voir détail sous le tableau si besoin).
- **405** : rejet explicite des méthodes non attendues, O/N.

| Route | Identité (fichier:ligne) | Anti-IDOR (fichier:ligne) | 405 |
|---|---|---|---|
| `api/patient/push-subscribe.ts` | `push-subscribe.ts:24` (`verifyPatientToken`) | Aucun identifiant externe — `participant_id` vient du JWT (L49, L67), jamais du body. `endpoint`/`subscription` (L38-44, L63) sont la ressource elle-même, pas une référence à un tiers. | O — L15-17 |
| `api/patient/activite.ts` | `activite.ts:20` (`verifyPatientToken`) | L52-57 (`test-etalon` : `tests_etalons_activations` filtré par `participant_id` ET `test_id`) et L92-97 (`exercice-libre`, même schéma sur `exercices_libres_activations`) — le `testId`/`exerciceId` fourni par le body n'est utilisé que s'il est activé POUR ce participant précis. | O — L13 |
| `api/planning/ics.ts` | `ics.ts:37` (`validatePraticienIcsToken`, token de query string comparé en base) | Aucun identifiant externe — `praticien.praticienId` (L40) vient du résultat de la validation du token, jamais d'un paramètre de requête. | O — L22-24 |
| `api/patient/session.ts` | Deux chemins : (1) code d'accès — `api/_lib/patientSession.ts:41-45` (`connexionParCode`, le code EST l'identité, comparé en base) ; (2) délégation praticien — `api/_lib/patientSession.ts:75` (`accesViaPraticien`, `supabase.auth.getUser`) | Chemin 1 : aucun identifiant externe (le code résout directement un seul participant). Chemin 2 : **oui**, `api/_lib/patientSession.ts:83-84` — `participantId` du body vérifié via RPC `acces_participant_pour(p_participant_id, p_user_id)` avant émission du token. | O — `session.ts:25-27` |
| `api/patient/me.ts` | `me.ts:79` (`verifyPatientToken`) | Aucun identifiant externe — toutes les requêtes (L93, L94, L100-101, L104, L116, L118, L160-161, L169-171, L180, L189, L200-201) filtrent par `participant_id` issu du JWT, aucun id de body/query utilisé. | O — L70-72 |
| `api/seances/supprimer-planifiees.ts` | `supprimer-planifiees.ts:30` (`supabase.auth.getUser`) | **Oui, explicite** — L41-45 : `contratIds[]` du body vérifiés `.eq('praticien_id', praticienId)`, puis L49-51 : le nombre de contrats vérifiés doit égaler le nombre demandé (sinon 403) avant toute suppression. | O — L17 |
| `api/organisation.ts` | **Aucune** — endpoint public assumé (commentaire L8-10 : "non authentifié"), protégé par rate limiting IP, pas par identité (L66-75, `organisation_demande_attempts`). | Aucun identifiant externe — création d'une ligne `organisations` (L94-100), pas de référence à une ressource existante. | O — L24-26 |
| `api/patient/retour-seance.ts` | `retour-seance.ts:21` (`verifyPatientToken`) | **Non — trou identifié ici, pas ailleurs.** `seanceId` vient du body (L27), validé seulement comme "string ou absent" (L35-37), puis inséré tel quel dans `retours_seance.seance_id` (L68) **sans vérifier qu'il appartient à `participantId`**. Contraste avec `api/patient/seance.ts` qui fait exactement cette vérification pour un cas similaire. | O — L12-14 |
| `api/cron/rappels.ts` | `rappels.ts:55` (`compareSecretTimingSafe` sur `CRON_SECRET`, temps constant) | Aucun identifiant externe — traitement systématique de toutes les séances planifiées (L112-116, L165-169), aucun ciblage par id fourni en entrée. | O — L41 |
| `api/patient/seance.ts` | `seance.ts:21` (`verifyPatientToken`) | **Oui, explicite et documenté** — L54-59 : `programmeId` vérifié `.eq('participant_id', participantId)` ; L65-70 : `seanceId` vérifié `.eq('programme_id', programmeId)` (donc transitivement lié au participant). Commentaire dédié L47-53. | O — L12-14 |
| `api/structure/data.ts` | `data.ts:29` (`validateStructureToken`, token d'en-tête comparé en base) | Aucun identifiant externe — `structure.id`/`structure.praticienId` (L35, L46, L70, L75) viennent du résultat de la validation du token, jamais d'un paramètre client. | O — L14-16 |
| `api/claude.ts` | `claude.ts:27` (`supabase.auth.getUser`) | Aucun identifiant externe — le `prompt` est un texte libre, pas une référence à une ressource d'un tiers. | O — L12-14 |

## Constat

**11 routes sur 12 ont les trois.** Une route — `api/patient/retour-seance.ts`
— accepte un `seanceId` externe sans vérifier son appartenance au patient
authentifié, contrairement à `api/patient/seance.ts` qui traite un cas
structurellement identique correctement. Ce n'est pas corrigé dans ce
document (audit, pas correction) — impact et correctif à évaluer :
`retours_seance` n'est jamais relu vers le patient qui l'a soumis (écriture
seule, pas de fuite de lecture), donc l'impact concret serait une
possibilité d'associer un retour subjectif (Borg RPE / bien-être) à une
séance d'un autre patient — une pollution d'intégrité, pas une fuite de
donnée de santé vers un tiers nouveau. À trancher : ouvrir un finding dédié
dans `docs/RAPPORT_SECURITE.md` avant correction.
