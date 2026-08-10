# Audit — flux de données de santé sortant de Supabase (lecture seule)

Audit réalisé en préparation d'une migration vers un hébergement certifié HDS.
Aucune correction n'est proposée à ce stade : ce document est factuel, il
inventorie l'existant.

## 1. Appels réseau sortants vers des tiers

| # | Service tiers | Origine (fichier) | Déclenchement | Données réellement transmises |
|---|---|---|---|---|
| 1 | **Anthropic** (`api.anthropic.com/v1/messages`) | `api/claude.ts` | Proxy unique pour tous les usages IA du front | Le champ `prompt` complet reçu du front — voir §2, contient systématiquement des données de santé quand l'appelant est `buildSystemPrompt`, `construirePrompt` (genererInterpretation.ts) ou `buildContextePatient` (genererProgrammeIA.ts) : nom/prénom, pathologie, traitements, allergies, antécédents, scores de tests, notes cliniques, dictées de séance. `reformulerMessageBeneficiaire.ts` envoie un texte libre (message client/motivation) qui peut aussi contenir du contenu clinique. |
| 2 | **Sentry** (ingestion `*.sentry.io`) | `src/lib/sentry.ts` (front) + `api/_lib/sentry.ts` (serveur) | Sur exception non gérée / événement capturé | Voir détail §3 — filtrage actif (`beforeSend`) : corps de requête, cookies, headers `authorization`/`cookie` supprimés côté serveur ; URL réécrite (UUID → `:id`, token structure → `:token`, query string et hash retirés) côté front ; breadcrumbs `console.*` supprimés. Stack traces et messages d'erreur bruts (`err.message`) ne sont eux **pas** filtrés — un message d'erreur JS qui interpolerait une valeur (ex. `Cannot read prenom of undefined: Camille`) pourrait fuiter en théorie, mais aucun cas de ce type identifié dans le code actuel. |
| 3 | **Service de push web** (relais Google FCM / Mozilla autopush / Apple selon navigateur du patient, via lib `web-push`) | `api/_lib/notifications.ts`, `api/patient/push-subscribe.ts` | Cron `api/cron/rappels.ts` | Payload = `{ title: 'Horizon', body: 'Vous avez une séance aujourd'hui.' }` ou variante veille — texte neutre, codé en dur, aucune donnée patient. En revanche l'`endpoint` + clés `p256dh`/`auth` de l'abonnement (identifiant d'appareil) sont stockés en base et transmis au service de push à chaque envoi — c'est une métadonnée (« ce device est associé à un patient suivi ») plutôt qu'une donnée de santé. |
| 4 | **API Adresse (data.gouv.fr)** | `src/utils/geocodeAdresse.ts` | Saisie/modification d'une adresse bénéficiaire | `rue`, `code postal`, `ville` du bénéficiaire, en clair, dans l'URL (query string) — pas de nom, pas d'id patient, pas de token. Appel non authentifié, direct depuis le navigateur du praticien. |
| 5 | **OpenStreetMap.fr** (tuiles cartographiques) | `src/components/map/MapView.tsx`, `MiniMap.tsx` | Affichage carte (ZonesPage, TourneePage) | Uniquement des tuiles image (x/y/z de la vue) — aucune donnée patient dans la requête elle-même. Fuite indirecte possible : le pattern de tuiles demandées + l'IP du praticien peuvent révéler approximativement les zones géographiques où résident des patients suivis, mais aucun identifiant n'est transmis. |
| 6 | **YouTube (`youtube-nocookie.com`)** | `src/components/YoutubePlayer.tsx` | Lecture vidéo de démonstration d'exercice | Requête d'iframe standard (id vidéo de l'exercice, IP/UA du navigateur du praticien) vers Google. Aucun identifiant patient transmis dans la requête, mais c'est un tiers hors UE non listé dans la politique de confidentialité actuelle (voir §7). |
| 7 | **Supabase** | Toute l'app | — | Rappel de cadrage : Supabase est la **source** interrogée (base de données/auth/storage), pas une destination supplémentaire — c'est le sujet de la migration HDS elle-même, pas un flux sortant additionnel. |

## 2. `api/claude.ts` + `buildSystemPrompt` — champs de santé injectés dans le prompt Anthropic

`api/claude.ts` (ligne 34-58) transmet tel quel le champ `prompt` construit côté front. Pour `buildSystemPrompt` (`src/pages/AssistantPage.tsx:268-411`, utilisé par les actions « contre-indications », « compte-rendu », « compte-rendu famille », « interprétation », « libre ») :

| Bloc du prompt | Champs de santé inclus |
|---|---|
| Profil patient | Nom, prénom, âge, date de naissance, taille, poids, IMC calculé, `pathologie`, `antecedentsMedicaux`, contre-indications à l'effort (détail texte) |
| Bloc « extra » | Niveau de douleur (/10) + localisation, nombre de chutes/12 mois, anticoagulants (oui/non), antécédents chirurgicaux, allergies, traitements en cours (nom, dose, effets secondaires), traitements arrêtés (nom, dose, date de fin), objectifs personnels, score de sédentarité (Ricci & Gagnon) et profil, score de fatigue (FSS) et profil |
| Bilans (dernier + précédent + antérieur) | Tous les scores : TUG 3m, Chair Stand 30s, HandGrip D/G, équilibre unipodal D/G, souplesse, TM6 (distance, Borg RPE, FC avant/après), mémoire immédiate/différée, Dubois MIS, interprétation IA existante, notes professionnelles, points de vigilance |
| Évolution inter-bilans | Deltas chiffrés entre bilans |
| Contrat de suivi | Contenu du contrat (durée, fréquence) |
| Programme actif | Nom, objectif, message de motivation, liste des exercices prescrits |
| Séances dictées récentes | Observations, progression, points d'attention, **douleurs signalées** (table `comptes_rendus_seances`) |
| Notes manuelles récentes | Ressenti, note libre, alertes, **douleur EVA** (table `notes_seances`) |
| Assiduité programme | Taux de réalisation, commentaires libres du patient |
| Présence aux séances planifiées | Statuts de présence |
| Structure de rattachement | Nom/type structure |

Autres appelants de `/api/claude` (hors `buildSystemPrompt`, mais avec des données de santé comparables) :
- `genererInterpretation.ts` (`construirePrompt`) : nom, prénom, âge, profil, douleur/fatigue (/10), toutes les valeurs de tests, notes du bilan précédent.
- `genererProgrammeIA.ts` (`buildContextePatient`) : nom, prénom, âge, pathologie, antécédents, traitements, allergies, profil de handicap, mode de déplacement, contre-indications, profils sédentarité/fatigue, derniers scores de bilan.
- `reformulerMessageBeneficiaire.ts` : texte libre à reformuler (peut contenir du contenu clinique selon ce que le praticien y a saisi).

## 3. Sentry — ce qui est réellement capturé

| Élément | Front (`src/lib/sentry.ts`) | Serveur (`api/_lib/sentry.ts`) |
|---|---|---|
| `sendDefaultPii` | `false` | `false` |
| `tracesSampleRate` | `0` (pas de tracing perf) | `0` |
| Corps de requête (`event.request.data`) | Non exposé par défaut (SDK front ne capture pas le body par défaut) | Supprimé explicitement (`delete event.request.data`) dans `beforeSend` |
| Cookies | — | Supprimés explicitement (`delete event.request.cookies`) |
| Headers `authorization`/`cookie` | — | Supprimés explicitement (regex sur toutes les clés de header) |
| URL de la requête | Réécrite : UUID → `:id`, `/structure/<token>` → `/structure/:token`, query string et hash **retirés entièrement** | Non traité (pas de `request.url` côté handler serverless dans ce filtre) |
| Breadcrumbs `console.*` | Supprimés entièrement (`beforeBreadcrumb` renvoie `null`) | Non applicable (pas de breadcrumbs console côté Node ici) |
| Breadcrumbs de type navigation (URL) | Redigées via `redactUrl` | — |
| Message d'exception (`err.message`) / stack trace | **Non filtré** — transmis tel quel | **Non filtré** — transmis tel quel (`Sentry.captureException(err, ...)`) |
| Activation | Uniquement si `VITE_SENTRY_DSN` (front) / `SENTRY_DSN` (serveur) configuré | idem |

Conclusion factuelle : un `beforeSend` existe bien des deux côtés et filtre activement les vecteurs les plus probables (body, cookies, auth headers, query strings, console.log). Le vecteur non couvert est le **message d'exception lui-même** : si un développeur écrit un jour `throw new Error(`Patient ${patient.nom} introuvable`)`, ce texte partirait vers Sentry sans filtrage supplémentaire. Aucune occurrence de ce type n'a été trouvée dans le code actuel (les messages d'erreur observés sont génériques : "Erreur enregistrement", "Session invalide", etc.), mais rien dans le code n'empêche structurellement ce cas.

## 4. Les 12 fonctions serverless `api/`

| # | Fonction | Lit des données de santé | Écrit des données de santé | Détail |
|---|---|---|---|---|
| 1 | `api/claude.ts` | Non (proxy) | Non | Relaie le prompt reçu vers Anthropic — ne lit/écrit rien en base lui-même |
| 2 | `api/cron/rappels.ts` | **Oui** | Non (écrit uniquement des logs d'envoi neutres) | Lit `seances` (dates/heures de RDV = donnée de santé au sens large : fréquence de suivi) |
| 3 | `api/organisation.ts` | Non | Non | Données d'organisation (nom, email contact, SIRET) — pas de donnée patient |
| 4 | `api/patient/activite.ts` | **Oui** | **Oui** | Lit/écrit résultats de tests étalons et validations d'exercices libres (données de suivi fonctionnel) |
| 5 | `api/patient/me.ts` | **Oui** | Non (lecture seule) | Lit et renvoie l'intégralité des données de santé du patient (bilans, séances, programmes, documents, tests) |
| 6 | `api/patient/push-subscribe.ts` | Non | Non | Gère uniquement l'abonnement push (endpoint/clés techniques) |
| 7 | `api/patient/retour-seance.ts` | **Oui** | **Oui** | Écrit Borg RPE + bien-être subjectif (données de santé) |
| 8 | `api/patient/seance.ts` | Non | **Oui** | Écrit séance réalisée + exercices réalisés (données de suivi) |
| 9 | `api/patient/session.ts` | Non | Non | Authentification uniquement (émission de token) |
| 10 | `api/planning/ics.ts` | **Oui** | Non | Lit dates/heures/type de séance + prénom+initiale patient (voir §5) |
| 11 | `api/seances/supprimer-planifiees.ts` | **Oui** | **Oui** (suppression) | Supprime des séances planifiées (dates de RDV liées à un patient) |
| 12 | `api/structure/data.ts` | **Oui** | Non (lecture seule) | Lit bilans, séances, programmes, documents pour tous les participants d'une structure |

→ 8 des 12 fonctions manipulent des données de santé au sens large (dont 6 en lecture, plusieurs en écriture) et devraient migrer hors Vercel dans le cadre du passage HDS ; `organisation.ts`, `patient/push-subscribe.ts`, `patient/session.ts` et `claude.ts` ne stockent/lisent aucune donnée de santé directement (mais `claude.ts` reçoit un `prompt` qui, lui, en contient — cf. §1-2).

## 5. Export ICS (`api/planning/ics.ts` + `api/_lib/planningIcs.ts`)

Champs présents dans le flux `.ics` généré :

| Champ ICS | Source | Contenu |
|---|---|---|
| `SUMMARY` | `participants.prenom` + initiale de `participants.nom` | Ex. `Camille D.` — nom complet **non** exposé |
| `DTSTART` / `DTEND` | `seances.date` + `seances.heure_debut`/`heure_fin` | Horaires de la séance |
| `LOCATION` | `seances.adresse` | Adresse de la séance si renseignée |
| `UID` (id) | `seances.id` | Identifiant technique de la séance |

Champs explicitement exclus par le code (commentaire en tête de fichier + `select()` restreint) : `notes`, `motif_annulation`, `motif_annulation_detail`, nom de famille complet du bénéficiaire. Les séances au statut `annulee` sont filtrées en amont (`neq('statut','annulee')`).

## 6. Suppression de compte / droit à l'effacement RGPD

Confirmé : **aucun mécanisme de suppression de compte ou d'effacement de données n'existe dans le code.**
- Aucun appel à `supabase.auth.admin.deleteUser` (ou équivalent) trouvé dans `api/` ou `src/`.
- Aucune fonction serverless dédiée à la suppression d'un praticien, d'un patient ou de ses données.
- La page `src/pages/PolitiqueConfidentialite.tsx` (lignes 116-129) **affirme** l'existence d'un « droit à l'effacement », d'un droit d'accès, de rectification, de portabilité, d'opposition et de limitation — mais ce sont des mentions légales textuelles sans mécanisme technique correspondant dans le code.
- La même page liste les sous-traitants (Supabase, Vercel, Sentry) mais laisse un placeholder non complété : *« [À COMPLÉTER — autres sous-traitants éventuels : emailing, SMS, IA, etc.] »* — **Anthropic n'y est pas mentionné** alors que des données de santé lui sont transmises (§1-2).

## 7. Variables d'environnement pointant vers un service tiers

| Variable | Service concerné | Portée |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic | Serveur uniquement (Vercel) |
| `SENTRY_DSN` | Sentry | Serveur (fonctions `api/`) |
| `VITE_SENTRY_DSN` | Sentry | Front (bundle client, valeur publique par construction) |
| `VITE_VAPID_PUBLIC_KEY` | Service de push web (VAPID, protocole standard, pas un vendeur en soi) | Front |
| `VAPID_PRIVATE_KEY` | Idem | Serveur uniquement |
| `VAPID_CONTACT_EMAIL` | Idem (champ `mailto:` du protocole VAPID, pas d'envoi d'email réel) | Serveur |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase | Front — source de données, pas un sous-traitant additionnel au sens de cet audit |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Serveur |
| `CRON_SECRET` | Interne (protection endpoint cron) | Non applicable — pas un tiers |
| `PATIENT_SESSION_SECRET` | Interne (signature JWT patient) | Non applicable — pas un tiers |
| `VERCEL_ENV` | Vercel (plateforme d'hébergement elle-même) | Runtime |

À noter : l'API Adresse (data.gouv.fr), OpenStreetMap.fr et YouTube (§1, lignes 4-6) sont appelés en dur dans le code, **sans variable d'environnement ni clé** — donc absents de cette liste par nature, mais à intégrer quand même à l'inventaire des sous-traitants/tiers pour le registre RGPD, puisqu'ils reçoivent des données (adresse pour le premier).
