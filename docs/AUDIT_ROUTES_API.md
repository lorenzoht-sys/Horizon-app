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
| `api/patient/retour-seance.ts` | `retour-seance.ts:21` (`verifyPatientToken`) | **Corrigé le 2026-08-19 ([F-13](RAPPORT_SECURITE.md))** — `seanceId` désormais vérifié L65-75 (`seances_patient` filtré par `id` ET `participant_id`, `404` sinon), sur le modèle exact de `api/patient/seance.ts`. Avant correctif : inséré tel quel sans vérification. | O — L12-14 |
| `api/cron/rappels.ts` | `rappels.ts:55` (`compareSecretTimingSafe` sur `CRON_SECRET`, temps constant) | Aucun identifiant externe — traitement systématique de toutes les séances planifiées (L112-116, L165-169), aucun ciblage par id fourni en entrée. | O — L41 |
| `api/patient/seance.ts` | `seance.ts:21` (`verifyPatientToken`) | `programmeId`/`seanceId` : **oui**, déjà correct (L54-59, L65-70). `exercices[].id` : **corrigé le 2026-08-19 ([F-14](RAPPORT_SECURITE.md))** — non vérifié jusqu'à ce jour (trouvé par le passage "identifiants secondaires" ci-dessous), maintenant vérifié en bloc contre `programme_exercices.seance_id = seanceId` avant tout insert, `404` sinon. | O — L12-14 |
| `api/structure/data.ts` | `data.ts:29` (`validateStructureToken`, token d'en-tête comparé en base) | Aucun identifiant externe — `structure.id`/`structure.praticienId` (L35, L46, L70, L75) viennent du résultat de la validation du token, jamais d'un paramètre client. | O — L14-16 |
| `api/claude.ts` | `claude.ts:27` (`supabase.auth.getUser`) | Aucun identifiant externe — le `prompt` est un texte libre, pas une référence à une ressource d'un tiers. | O — L12-14 |

## Constat (premier passage, identifiant principal)

**12 routes sur 12 ont les trois**, après correctif de `api/patient/retour-seance.ts`
(F-13, corrigé le 2026-08-19 — voir `docs/RAPPORT_SECURITE.md`). C'est ce
premier passage qui a trouvé F-13 : il ne vérifiait que l'identifiant
**principal** de chaque route (`participant_id`/`praticien_id`, toujours
dérivé du JWT — vrai partout) sans regarder systématiquement les
identifiants **secondaires** acceptés du body. D'où le passage ci-dessous.

---

## Identifiants secondaires — audit complémentaire (2026-08-19)

Le trou trouvé sur `retour-seance.ts` n'était pas sur l'identifiant
principal (`participantId`, bien vérifié) mais sur un identifiant
secondaire (`seanceId`) traité par erreur comme une donnée opaque. Ce
passage reprend les 12 routes et liste **tout** identifiant reçu du client
(body/query/header) qui référence une ligne en base — pas les champs de
contenu pur (texte libre, nombres, énumérations sans référence externe).

| Route | Identifiants reçus du client | Vérifiés ? |
|---|---|---|
| `push-subscribe.ts` | `endpoint` (POST+DELETE) | **Oui, par construction** — `push_subscriptions` a une contrainte `UNIQUE (participant_id, endpoint)` (migration `20260615_rappels_patients.sql:47`), et toute requête combine `.eq('participant_id', participantId)` avec `endpoint` (L49, L67 upsert/delete). Un `endpoint` d'un autre patient ne matche jamais une ligne de ce patient — pas une donnée de contenu ambiguë, un vrai identifiant, mais dont le risque est neutralisé structurellement. |
| `activite.ts` | `testId`, `exerciceId` | **Oui** — L52-57 et L92-97, filtrés par `participant_id` ET l'id, exige `actif = true` (déjà noté dans le tableau principal). |
| `ics.ts` | `token` (query) | C'est l'identité elle-même (voir tableau principal), pas un identifiant secondaire distinct. |
| `session.ts` | Chemin 1 : `code` (= l'identité). Chemin 2 : `participantId` | Chemin 2 : **oui** — `api/_lib/patientSession.ts:83-84`, RPC `acces_participant_pour`. |
| `me.ts` | Aucun (GET, rien depuis le JWT à part `participantId` lui-même) | N/A |
| `supprimer-planifiees.ts` | `contratIds[]` (autorisation), `participantId` (optionnel, métadonnée de log) | `contratIds[]` : **oui** (L41-45+49-51, déjà noté). `participantId` : **volontairement non vérifié — ne pas "corriger" à l'aveugle.** N'entre dans **aucune** requête de lecture/écriture/autorisation ; seul usage : `logAuditEvent(...)` (L71) comme métadonnée descriptive du journal d'audit. L'autorisation réelle de la suppression repose entièrement sur `contratIds[]` (déjà vérifié L41-51), pas sur ce champ. Impact si falsifié : une entrée d'audit qui attribue une suppression légitime au mauvais participant — pollution de traçabilité, pas un accès non autorisé, pas un IDOR. **Si l'usage change** (ex. ce champ commence à filtrer une requête, ou à conditionner une réponse), il faudra le vérifier comme n'importe quel identifiant secondaire — voir la règle dans `docs/RAPPORT_SECURITE.md`, note de méthode F-13/F-14. |
| `organisation.ts` | Aucun (création pure, pas de référence à une ressource existante) | N/A |
| `retour-seance.ts` | `seanceId` | **Oui depuis le correctif F-13** (L65-75). |
| `cron/rappels.ts` | Aucun (traitement systématique, pas de ciblage par id client) | N/A |
| `seance.ts` | `programmeId`, `seanceId` (= `programme_seances.id`), `exercices[].id` (= `exercice_id`, inséré dans `exercices_realises`) | `programmeId`/`seanceId` : **oui** (L54-70, déjà noté). `exercices[].id` : **corrigé le 2026-08-19 ([F-14](RAPPORT_SECURITE.md))** — voir constat ci-dessous. |
| `structure/data.ts` | Aucun (GET, le token d'en-tête est l'identité elle-même) | N/A |
| `claude.ts` | `model` (enum fermé, pas une référence de ligne) | N/A — whitelist L60-62, pas un identifiant d'entité. |

## Constat (deuxième passage) — deuxième trou, corrigé le 2026-08-19

**`api/patient/seance.ts`, `exercices[].id`** (envoyé dans le tableau
`exercices` du body) était inséré comme `exercice_id` dans
`exercices_realises` **sans vérifier qu'il appartient au programme du
participant**. La seule contrainte était la clé étrangère
`exercices_realises.exercice_id → programme_exercices(id)`
(`20260620_consolidation_seances_patient.sql:265`, commentaire du fichier :
*"PAS un id de la bibliothèque statique d'exercices"* — donc bien une
table dont chaque ligne appartient à un programme, potentiellement d'un
autre participant/praticien). La FK garantit seulement que l'id EXISTE
quelque part dans la base, jamais qu'il appartient à CE programme.

**Ce n'était pas qu'un id à deviner** — c'est ce qui distingue ce trou de
"théorique" : un `programme_exercices.id` circule légitimement dans les
réponses de l'espace patient (`api/patient/me.ts` le renvoie dans
`programmeExercices`), donc visible côté navigateur, et reste valide
après un changement de programme (pas de rotation). Un id **connu**, pas
seulement deviné — l'argument "espace UUID donc faible" évaluait la
difficulté de deviner, pas le cas où l'attaquant en connaît déjà un.

**Effet secondaire, également fermé par le correctif — oracle
d'existence** : l'ancien code insérait les exercices un par un et
retournait `500` dès le premier échec (`id` inexistant → violation FK) ou
`200` si tout passait, permettant de distinguer "cet id existe dans
`programme_exercices`, quelque part dans la base" de "n'existe pas" — même
famille que F-11.

**Corrigé (F-14, `docs/RAPPORT_SECURITE.md`)** : vérification groupée (un
seul aller-retour, pas un `.eq()` par exercice — pour ne pas recréer
l'oracle un par un) que tous les `exercices[].id` fournis appartiennent à
`programme_exercices.seance_id = seanceId` avant tout insert. Échec →
`404 { error: 'Exercice introuvable' }`, jamais un statut qui distingue
"inexistant" de "pas à vous".
