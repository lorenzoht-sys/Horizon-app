# Socle Clever Cloud (migration HDS)

Préparation de la migration d'Horizon de Supabase + Vercel vers Clever Cloud.
**Rien dans ce dossier n'est actif** : la production reste sur Vercel et
Supabase tant que la bascule n'a pas été décidée. Inventaire de départ : doc
« Horizon : inventaire Supabase avant migration HDS vers Clever Cloud ».

## Contenu

| Fichier | Rôle | État |
| --- | --- | --- |
| `Dockerfile.app` | image unique front statique + 12 routes `api/` | prêt, non construit sur Clever Cloud |
| `serveur/serveur.mjs` | serveur HTTP (port 8080) qui exécute les routes Vercel sans les modifier et applique les en-têtes de `vercel.json` | testé (`npm run test:clever`) |
| `serveur/compatVercel.mjs` | `req.query`, `req.body`, `res.status().json()/send()` ; garde la dernière IP de X-Forwarded-For | testé |
| `serveur/cron.mjs` | tâche horaire (HH:15) si `pg_cron` est absent, instance 0 seulement, désactivée par défaut | testé |
| `tsconfig.api-build.json` | compile `api/` vers `dist-api/` (12 routes recensées) | vérifié |
| `postgrest/` | image PostgREST figée + variables | prêt |
| `sql/01_compat_auth.sql` | schéma `auth` minimal : `auth.uid()`, `auth.users` (id + e-mail, aucun mot de passe) | testé sur PostgreSQL 16 |
| `scripts/nettoyer-dump.mjs` | retire d'un dump Supabase ce qui ne se restaure pas ailleurs | testé |
| `scripts/repetition.sh`, `sql/02_controle_repetition.sql`, `scripts/repetition-http.test.mjs` | répétition à blanc de la migration du schéma, avec contrôles de RLS | rejouée par la CI |
| `serveur/compatDeno.mjs`, `stockageS3.mjs`, `relais.mjs` | Edge Functions, stockage Cellar, relais PostgREST | testés |
| `serveur/jetonPraticien.mjs` | vérification locale du jeton praticien (RS256 par JWKS ou HS256 par secret, jamais les deux), derrière `client.auth.getUser` | testé avec des jetons signés en local ; jamais confronté à un vrai Keycloak |
| `serveur/repriseFactures.mjs`, `sql/03_facture_pdf_sans_pg_net.sql` | génération des PDF de factures sans `pg_net` ni Vault : l'application reprend les factures validées sans PDF et appelle la fonction `facturation-pdf` | testés ; le SQL est rejoué par la répétition à blanc |
| `scripts/copier-factures.mjs` | copie des PDF de factures du stockage Supabase vers Cellar, contrôlée par empreinte SHA-256 ; sans `--executer`, compare sans rien écrire | testé contre de faux services, jamais lancé sur des données réelles |

## Répétition à blanc (rejouable, données fictives)

`PGURI=postgresql://… clevercloud/scripts/repetition.sh` reconstruit la base sur un PostgreSQL standard **vide et jetable** (le script refuse une base qui contient déjà des tables) :

1. rôles `anon`, `authenticated`, `service_role` ;
2. `sql/01_compat_auth.sql` ;
3. les 35 migrations de `supabase/migrations/`, nettoyées par `scripts/nettoyer-dump.mjs` : 62 tables, toutes avec RLS, 135 politiques (les 3 politiques du schéma `storage` sont retirées), 52 fonctions, 64 triggers (relevé du 12/11/2026) ;
4. `sql/02_controle_repetition.sql` : deux praticiens et deux bénéficiaires fictifs, puis 8 contrôles (cloisonnement en lecture et en écriture, usurpation d'identité refusée, garde-fou RGPD, rôle `anon` sans accès, rôle serveur, RLS sur toutes les tables).

Le job `repetition-cible` de la CI la rejoue à chaque PR sur **PostgreSQL 17**, puis démarre PostgREST (même image que `postgrest/`) et vérifie le chemin complet du front praticien, serveur Node → `/rest/v1` → PostgREST → RLS, avec des jetons signés (`scripts/repetition-http.test.mjs`).

Écart relevé : la production Supabase est en **PostgreSQL 17** (privilège `MAINTAIN`). Choisir la version 17 pour l'add-on.

## Faits dans le serveur, sans modifier l'application

Le front, les routes `api/` et les Edge Functions gardent leur code. Le serveur reprend les chemins qu'appelle `supabase-js` :

| Chemin | Rôle | Fichier | Activé par |
| --- | --- | --- | --- |
| `/api/*` | les 12 routes | `compatVercel.mjs` | toujours |
| `/functions/v1/<nom>` | les 3 Edge Functions, lues en TypeScript par Node (>= 22.18) | `compatDeno.mjs`, `crochetsModules.mjs` | toujours |
| `/rest/v1/*` | relais vers PostgREST, préfixe retiré | `relais.mjs` | `POSTGREST_URL` |
| `/storage/v1/object/factures/*` | téléchargement d'une facture par le praticien, après contrôle par la RLS de `factures` | `relais.mjs` | `POSTGREST_URL` et Cellar |
| `client.storage` côté serveur | écriture, lecture et URL présignée dans Cellar (S3, signature V4) | `stockageS3.mjs`, `clientCompat.mjs` | `CELLAR_ADDON_HOST`, `CELLAR_ADDON_KEY_ID`, `CELLAR_ADDON_KEY_SECRET` |

`SUPABASE_URL` (lu par les routes et les fonctions) vaut alors l'adresse de l'application elle-même, puisqu'elle sert `/rest/v1`.

Sans ces variables, rien ne change : le stockage Supabase reste utilisé, ce qui permet une recette par étapes. Tests : `node --test clevercloud/serveur/*.test.mjs` (job `serveur-clevercloud` de la CI). La signature S3 est vérifiée par les exemples de la documentation AWS ; elle reste à confirmer contre Cellar en recette (région, adressage par chemin).

## Ce qui reste à faire (PR suivantes, chacune derrière un interrupteur)

1. **Front praticien → Keycloak** : remplacer les appels `supabase.auth.*` (connexion, session, mot de passe oublié, invitation) par OIDC, et transmettre le jeton Keycloak à `supabase-js` pour PostgREST. Côté serveur, six points vérifient le jeton du praticien par `supabase.auth.getUser` (`api/claude.ts`, `api/_lib/adminAuth.ts`, `api/_lib/patientSession.ts`, `api/seances/supprimer-planifiees.ts`, et les fonctions `analyser-seance` et `facturation-envoi`) : **traité** par `serveur/jetonPraticien.mjs`, qui vérifie le jeton localement derrière le même appel (`AUTH_JWKS_URL` pour Keycloak, ou `AUTH_JWT_SECRET` pour une connexion gérée par l'application ; `AUTH_ISSUER` et `AUTH_AUDIENCE` conseillés). Ces six points gardent leur code, quel que soit le fournisseur retenu. Reste côté serveur : `api/organisation.ts`, qui utilise l'API d'administration des comptes (liste, invitation, mise à jour) et répond par un refus explicite sur la cible tant qu'elle n'est pas branchée sur le fournisseur.
2. **`public.declencher_pdf_facture`** : seule fonction qui utilisait `pg_net` et Vault. Traité sans dépendre de l'add-on : `sql/03_facture_pdf_sans_pg_net.sql` neutralise le corps de la fonction sur la cible, et `REPRISE_FACTURES_PDF=1` fait générer les PDF par l'application (passage toutes les 15 s, instance 0, nouvel essai en cas d'échec). Reste la recette sur la cible : valider une facture, vérifier que son PDF arrive dans Cellar.
3. **Copie des PDF** du bucket Supabase vers Cellar : le script existe (`scripts/copier-factures.mjs`, liste tirée de `factures.pdf_path`, relecture et empreinte de chaque fichier, aucun écrasement). Reste à le lancer en recette, puis à la bascule, par Lorenzo.
4. **Services externes** : décision sur Anthropic et Resend, qui reçoivent des données de santé.

## Ressources prévues

| Organisation | Ressource | Remarque |
| --- | --- | --- |
| ORGA_HDS (parhds) | application `horizon-app` (Docker, `Dockerfile.app`) | front + API, port 8080 |
| ORGA_HDS | application `horizon-postgrest` (Docker, `postgrest/Dockerfile`) | pool borné à 10 |
| ORGA_HDS | add-on PostgreSQL 17 | **chiffrement au repos à cocher à la création** ; rôles `anon`, `authenticated`, `service_role` à demander au support |
| ORGA_HDS | add-on Cellar | bucket `factures`, privé, URL présignées |
| ORGA_STANDARD | add-on Keycloak | praticiens uniquement ; patients et structures gardent leurs jetons |

Pas de Redis : Horizon n'a pas de file de travaux.

## Correspondance des variables

| Aujourd'hui (Vercel / Supabase) | Sur Clever Cloud |
| --- | --- |
| `VERCEL_ENV` | `APP_ENV` (`production` ou `staging`), **obligatoire** : le serveur refuse de démarrer sans. Il en déduit `VERCEL_ENV`, sinon les routes renverraient le détail des erreurs |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | adresse PostgREST + jeton `service_role` signé avec la clé de PostgREST (PR 1) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | adresse publique de PostgREST ; arguments de build de l'image |
| `PATIENT_SESSION_SECRET`, `CRON_SECRET`, `VAPID_*`, `ANTHROPIC_API_KEY`, `APP_URL`, `SENTRY_DSN` | inchangées (nouvelles valeurs pour staging) |
| `RESEND_API_KEY`, `FACTURES_EXPEDITEUR`, `ORIGINES_AUTORISEES`, `FACTURATION_WEBHOOK_SECRET` | variables de l'application qui accueillera les Edge Functions |
| job pg_cron + `pg_net` | `CRON_INTERNE=1` (instance 0), **après** arrêt du job pg_cron |
| Supabase Auth, côté serveur (`auth.getUser`) | `AUTH_JWKS_URL` (ou `AUTH_JWT_SECRET`), `AUTH_ISSUER`, `AUTH_AUDIENCE` : les mêmes clés que `PGRST_JWT_SECRET` de PostgREST |
| trigger `pg_net` + secrets Vault (`facturation_pdf_url`, `facturation_webhook_secret`) | `REPRISE_FACTURES_PDF=1` (instance 0), avec `POSTGREST_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `FACTURATION_WEBHOOK_SECRET` ; `sql/03_facture_pdf_sans_pg_net.sql` joué sur la base |
| — | `PORT` / `CC_DOCKER_EXPOSED_HTTP_PORT` (8080), `CC_DOCKERFILE` |

## Procédure (staging d'abord, toujours avec des données fictives)

Les commandes Clever Tools s'exécutent sur le poste de Lorenzo, qui saisit
lui-même identifiants et secrets.

1. Créer les deux organisations, puis l'add-on PostgreSQL 17 en `parhds` avec le chiffrement au repos.
2. Demander au support les rôles `anon`, `authenticated`, `service_role`, et l'appartenance de l'utilisateur de l'add-on à ces rôles (nécessaire à PostgREST).
3. `psql "$URI?sslmode=require" -v cible=staging -f clevercloud/sql/01_compat_auth.sql` ; puis, **après** la restauration du schéma (étape 4), `-f clevercloud/sql/03_facture_pdf_sans_pg_net.sql`.
4. Schéma : dump du schéma `public` du **staging** Supabase (`pg_dump --schema=public --no-owner`), puis `node clevercloud/scripts/nettoyer-dump.mjs dump.sql dump-net.sql rapport.md` dans `clevercloud/_dumps/` (ignoré par git), puis restauration. Lire le rapport.
5. Données : jeu fictif (`scripts/seed-staging.sql`), avec `auth.users` alimentée en id + e-mail seulement.
6. Déployer `horizon-postgrest`, puis `horizon-app` (`APP_ENV=staging`).
7. Faire passer les tests e2e et le harnais RLS sur l'adresse de staging Clever Cloud.

## Questions pour l'hébergeur

1. Versions de PostgreSQL disponibles en `parhds` (17 nécessaire) ; extensions `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`.
2. Création des rôles `anon`, `authenticated`, `service_role` et `GRANT <rôle> TO <utilisateur de l'add-on>`. PostgREST change de rôle à chaque requête (`SET ROLE`).
3. Peut-on servir une application sous un préfixe de chemin (`app.horizon-suivi.fr/rest/v1` → PostgREST) ? Le préfixe est-il retiré avant transmission ? (Facultatif depuis le relais de `serveur.mjs` : la réponse permettrait seulement d'éviter un saut.)
4. Comportement de `X-Forwarded-For` derrière les load balancers : la dernière valeur est-elle toujours l'IP vue par la plateforme ? La limitation des tentatives de connexion patient en dépend.
5. Les variables de l'application sont-elles transmises au build Docker comme `ARG` ? Le front en a besoin au build.
6. Keycloak en zone standard pour des comptes de professionnels de santé : conforme à leur lecture du périmètre HDS ?
7. Sauvegardes de l'add-on : fréquence, rétention, restauration à un instant donné (PITR), test de restauration.
8. Journaux des applications : durée de conservation et localisation. Ils peuvent contenir des identifiants techniques.

## Liste de vérification avant bascule

- [ ] Staging Clever Cloud : e2e et harnais RLS verts, recette manuelle des trois espaces.
- [ ] Contrat HDS signé ; chiffrement au repos vérifié sur PostgreSQL et Cellar.
- [ ] Rapport du nettoyeur relu sur le dump de **production** ; `sql/03_facture_pdf_sans_pg_net.sql` joué et `REPRISE_FACTURES_PDF=1` : une facture validée en recette obtient son PDF.
- [ ] Praticiens importés dans Keycloak avec leurs UUID ; e-mail de réinitialisation du mot de passe prêt.
- [ ] PDF de factures copiés vers Cellar, nombre de fichiers et sommes de contrôle identiques.
- [ ] Comptes de lignes identiques, table par table, entre Supabase et Clever Cloud.
- [ ] Job pg_cron Supabase arrêté **avant** `CRON_INTERNE=1` (sinon les rappels partent en double).
- [ ] Décision prise pour Anthropic et Resend.
- [ ] DNS : TTL abaissé la veille ; QR codes et liens ICS pointent sur le domaine canonique, pas sur une adresse de plateforme.
- [ ] Plan de retour arrière écrit : Supabase et Vercel restent intacts jusqu'à validation complète.
- [ ] Écritures en production faites par Lorenzo seul.
