# GUIDE_STAGING.md — Mise en place de l'environnement de staging

Ce document est le **guide unique et à jour** pour créer l'environnement de
staging (il remplace `supabase/migrations/SETUP_STAGING.md`, désormais un
simple pointeur vers ce fichier).

**Objectif** : créer un **deuxième projet Supabase**, séparé de la
production, et le brancher sur les **Preview Deployments** de Vercel, pour
pouvoir tester (manuellement ou via Playwright) sans jamais toucher aux
vraies données patients.

```
                Production (branche main)         Preview (PRs / autres branches)
                       |                                      |
                       v                                      v
              Projet Supabase PROD                  Projet Supabase STAGING
              (rjgzeuywwknubpwigozq)                ("horizon-staging", nouveau)
              vraies données patients               données 100% fictives
                                                      (scripts/seed-staging.sql)
```

⚠️ Comme pour les migrations : **aucune des commandes ci-dessous n'a été
exécutée par Claude**. C'est une procédure à suivre toi-même (Lorenzo), une
seule fois. Rien ne touche au projet de production.

---

## Étape 1 — Créer le projet Supabase "horizon-staging"

1. Va sur https://supabase.com/dashboard/projects et clique **New project**.
2. Choisis la **même organisation** que le projet de production
   (`horizon-app`), et donne au nouveau projet le nom **`horizon-staging`**.
3. Choisis la **même région que la production : `eu-west-3` (Paris)**, pour
   limiter les écarts de comportement (latence, etc.).
4. Définis un mot de passe de base de données — note-le dans ton
   gestionnaire de mots de passe (tu en auras besoin pour le SQL Editor si
   la connexion expire).
5. Attends la fin de la création (1-2 minutes), puis note le **project ref**
   du nouveau projet (visible dans l'URL du dashboard :
   `supabase.com/dashboard/project/<CE_REF>`).

---

## Étape 2 — Appliquer toutes les migrations dans l'ordre

Le dossier `supabase/migrations/` ne suffit pas, à lui seul, à recréer la
base depuis zéro (voir `supabase/migrations/README.md`, section "Limite
connue") : les tables "de base" du projet (`participants`, `praticiens`,
`bilans`, `contrats`, `programmes`, `seances`, etc.) ont été créées **avant**
la mise en place de ce dossier — il n'existe aucun fichier `CREATE TABLE`
pour elles dans `supabase/migrations/`.

La procédure se fait donc en **deux temps** : (2.1) une copie complète du
schéma actuel de production (qui contient ces tables de base + tout ce qui a
déjà été appliqué en prod), puis (2.2) les migrations qui ne sont peut-être
pas encore dans cette copie.

### 2.1 — Copier le schéma actuel de production

1. Lie le CLI Supabase au projet de **production** (si ce n'est pas déjà
   fait) :
   ```bash
   supabase link --project-ref rjgzeuywwknubpwigozq
   ```
2. Génère une copie du schéma actuel (tables, colonnes, policies RLS,
   fonctions, jobs pg_cron éventuels...) :
   ```bash
   supabase db dump --schema public -f supabase/_staging_schema_dump.sql
   ```
   Ce fichier est **temporaire** : il est listé dans `.gitignore` (ne pas le
   committer), supprime-le une fois l'étape 2.2 terminée.
3. Ouvre le projet **horizon-staging** sur le dashboard Supabase, va dans
   **SQL Editor > New query**, colle l'intégralité du contenu de
   `supabase/_staging_schema_dump.sql`, puis clique **Run**. Cela recrée
   toutes les tables, index, fonctions et policies RLS telles qu'elles
   existent actuellement en production.

> ℹ️ Note : les objets `documents_patient`, `documents_partages` et la
> fonction `get_praticien_structure()` ont des fichiers de migration dans ce
> dossier (`20260603_documents_patient.sql`, `20260607_documents_partages.sql`,
> `20260607_praticien_portail_structure.sql`) mais **n'existent pas
> réellement en production** (ces migrations n'ont jamais été appliquées).
> Le dump ci-dessus ne les contiendra donc pas non plus — c'est normal et
> staging reflète fidèlement la prod sur ce point. (`20260613_rls_anon_lockdown.sql`
> a été corrigé pour ne plus en dépendre, voir Étape 2.2.)

### 2.2 — Appliquer les migrations pas encore dans le dump

Pour chacun des fichiers ci-dessous, **dans cet ordre**, ouvre-le, copie son
contenu, colle-le dans le **SQL Editor du projet `horizon-staging`** et
clique **Run** :

1. `supabase/migrations/20260613_create_bilans_brouillons.sql`
2. `supabase/migrations/20260613_programme_v2_rls.sql`
3. `supabase/migrations/20260613_rls_anon_lockdown.sql`
4. `supabase/migrations/20260613_patient_login_rate_limit.sql`
5. `supabase/migrations/20260613_structure_access_logs.sql`
6. `supabase/migrations/20260613_audit_logs.sql`
7. `supabase/migrations/20260614_add_code_acces_participants.sql`
8. `supabase/migrations/20260615_rappels_patients.sql`
9. *(optionnel, voir Étape 8)* `supabase/migrations/20260616_cron_rappels_patients_staging.sql`
10. `supabase/migrations/20260618_retours_seance.sql`
11. `supabase/migrations/20260619_tm6_pauses_duree.sql`
12. `supabase/migrations/20260619_tinetti_bilans.sql`
13. `supabase/migrations/20260619_templates_structure.sql`
14. `supabase/migrations/20260620_consolidation_seances_patient.sql` — documente
    enfin (CREATE TABLE) les 5 tables "programme V2" jamais versionnées
    (`seances_patient`, `exercices_realises`, `programme_seances`,
    `programme_planning`, `programme_exercices`) ; à appliquer même si ces
    tables existent déjà (no-op garanti par `IF NOT EXISTS`), idéalement
    avant le fichier 2 (`20260613_programme_v2_rls.sql`) sur une
    réinstallation qui ne repartirait pas du dump de l'étape 2.1.
15. `supabase/migrations/20260620_seances_autonomes.sql`
16. `supabase/migrations/20260620_tests_etalons_exercices_libres.sql`

Tous ces fichiers sont **idempotents** (`CREATE TABLE IF NOT EXISTS`,
`DROP POLICY IF EXISTS` puis `CREATE POLICY`, `ADD COLUMN IF NOT EXISTS`,
etc.) : si l'un d'eux était déjà inclus dans le dump de l'étape 2.1 (par
exemple si la production a été mise à jour entre-temps), le ré-exécuter ne
casse rien — il ne fera rien de plus.

> ⚠️ Correctif appliqué dans cette session : `20260613_rls_anon_lockdown.sql`
> référençait `documents_patient`, `documents_partages` et
> `get_praticien_structure()`, qui n'existent pas dans cette base (constaté
> et contourné manuellement en prod, sans corriger le fichier jusqu'ici). Le
> fichier a été corrigé (sections renumérotées 1 à 4, références retirées) :
> il s'applique maintenant proprement sur staging et sur toute future
> réinstallation, sans adaptation manuelle.

### Référence — liste complète des migrations (ordre chronologique)

Pour mémoire, voici l'intégralité de `supabase/migrations/` dans l'ordre. Les
fichiers du haut (jusqu'à `20260611_*`) font partie des tables "de base" et
sont couverts par le dump de l'étape 2.1 ; ceux listés en 2.2 sont à
appliquer manuellement.

```
20260529_add_naissance_fields.sql
20260601_add_comptes_rendus_seances.sql
20260602_assistant_logs.sql
20260603_traitements_antecedents_structures.sql
20260603_contrat_duree_indeterminee.sql
20260603_documents_patient.sql
20260604_factures_suivi.sql
20260604_structures.sql
20260604_structures_anon_access.sql
20260607_praticien_portail_structure.sql
20260607_documents_partages.sql
20260607_seed_structure_test.sql
20260608_add_fatigue_sedentarite_bilans.sql
20260608_fix_structure_anon_rls.sql
20260608_fix_assistant_logs.sql
20260609_fix_contrats_colonnes.sql
20260610_add_anamnese_participants.sql
20260611_add_nom_naissance.sql
20260613_audit_logs.sql                          ← Étape 2.2 (1)*
20260613_create_bilans_brouillons.sql            ← Étape 2.2 (1)*
20260613_patient_login_rate_limit.sql            ← Étape 2.2 (4)
20260613_programme_v2_rls.sql                    ← Étape 2.2 (2)
20260613_rls_anon_lockdown.sql                   ← Étape 2.2 (3)
20260613_structure_access_logs.sql               ← Étape 2.2 (5)
20260614_add_code_acces_participants.sql         ← Étape 2.2 (7)
20260615_rappels_patients.sql                    ← Étape 2.2 (8)
20260616_cron_rappels_patients.sql               (variante PROD, pas pour staging)
20260616_cron_rappels_patients_staging.sql       ← Étape 2.2 (9, optionnel)
20260618_retours_seance.sql                      ← Étape 2.2 (10)
20260619_tm6_pauses_duree.sql                    ← Étape 2.2 (11)
20260619_tinetti_bilans.sql                      ← Étape 2.2 (12)
20260619_templates_structure.sql                 ← Étape 2.2 (13)
20260620_consolidation_seances_patient.sql       ← Étape 2.2 (14)
20260620_seances_autonomes.sql                   ← Étape 2.2 (15)
20260620_tests_etalons_exercices_libres.sql      ← Étape 2.2 (16)
```
\* `20260613_audit_logs.sql` et `20260613_create_bilans_brouillons.sql`
n'ont pas de dépendance d'ordre entre eux ni avec les autres `20260613_*` —
l'ordre donné en Étape 2.2 (1 à 6) est celui utilisé en production, à
réutiliser par cohérence.

---

## Étape 3 — Lancer `scripts/seed-staging.sql` (données fictives)

1. Dans le projet **horizon-staging** : **Authentication > Users > Add
   user**.
   - Email : `staging.praticien@example.com`
   - Coche **Auto Confirm User**.
   - Choisis un mot de passe que tu pourras réutiliser pour les tests
     manuels et Playwright.
2. Toujours dans **horizon-staging** : **SQL Editor > New query**, colle le
   contenu de `scripts/seed-staging.sql`, clique **Run**. Cela crée :
   - le profil praticien de démo (`Praticien Démo Staging`),
   - 2 participants fictifs : **Camille Martin** (code d'accès
     `CAME2E26`) et **Julien Bernard** (code d'accès `JUNE2E27`),
   - des bilans, un programme (V1 + V2), un contrat, des séances d'agenda
     pour Camille,
   - une structure de test : `/structure/staging-token-demo-0001`
     (Julien y est rattaché).

   Ce script est idempotent : si Camille Martin existe déjà, il ne fait
   rien (message `NOTICE`).

> ℹ️ `scripts/seed-staging.sql` est déjà à jour avec le nouveau format de
> code d'accès (`code_acces`, colonne ajoutée par la migration
> `20260614_add_code_acces_participants.sql` — Étape 2.2). Aucune ligne
> `rappel_preferences` n'est nécessaire : en son absence, l'application
> utilise les valeurs par défaut (rappel 2h avant la séance, relance après 3
> jours d'inactivité — voir `api/_lib/rappels.ts`, `PREFS_PAR_DEFAUT`).

---

## Étape 4 — Récupérer les clés API du projet de staging

Dans **horizon-staging** : **Project Settings > API**.

- **Project URL** → `VITE_SUPABASE_URL`.
- **anon public key** → `VITE_SUPABASE_ANON_KEY`.
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secrète — ne jamais
  la mettre dans le code, uniquement dans Vercel).

---

## Étape 5 — Configurer Vercel (variables par environnement)

Sur https://vercel.com — projet **horizon-app** — **Settings > Environment
Variables**. Vercel permet de définir une valeur différente par
environnement (**Production**, **Preview**, **Development**).

Pour chacune des variables suivantes, ajoute une valeur **spécifique à
l'environnement Preview uniquement** (décoche **Production** et
**Development** dans le formulaire d'ajout) :

| Variable                     | Production (déjà en place, ne pas toucher) | Preview (à ajouter, valeurs de staging) |
|-------------------------------|------------------------------------|------------------------------------------|
| `VITE_SUPABASE_URL`           | URL du projet prod                 | URL du projet `horizon-staging` (Étape 4)|
| `VITE_SUPABASE_ANON_KEY`      | clé anon du projet prod            | clé anon de `horizon-staging` (Étape 4)  |
| `SUPABASE_SERVICE_ROLE_KEY`   | clé service_role du projet prod    | clé service_role de `horizon-staging`    |
| `PATIENT_SESSION_SECRET`      | secret de prod                     | une autre valeur aléatoire (dédiée staging) |
| `ANTHROPIC_API_KEY`           | clé API de prod                    | peut rester la même, ou une clé dédiée si tu veux suivre l'usage séparément |

➡️ Résultat : tout déploiement de la branche `main` (Production) continue
d'utiliser la vraie base ; tout autre déploiement (Preview — branches, PRs)
utilise automatiquement le projet `horizon-staging` et ses données fictives.
Aucun changement de code n'est nécessaire : `src/lib/config.ts` lit ces
variables via `import.meta.env`, et `getAppHost()` s'adapte automatiquement
à l'URL du déploiement (prod ou preview).

> Si tu comptes tester les **rappels automatiques** (notifications push),
> ajoute aussi les variables VAPID/`CRON_SECRET` — voir Étape 8.

---

## Étape 6 — Vérifier sur une Preview

1. Pousse une branche quelconque (ou ouvre une PR) pour déclencher un
   déploiement **Preview**.
2. Ouvre l'URL de preview, connecte-toi avec
   `staging.praticien@example.com`.
3. Vérifie que tu vois **Camille Martin** et **Julien Bernard**, avec leurs
   bilans / programme / séances de démonstration.
4. Va sur `/patient`, connecte-toi avec le code **`CAME2E26`** (Camille) —
   tu dois voir son programme et ses bilans.
5. Ouvre le portail structure `/structure/staging-token-demo-0001` — tu dois
   voir Julien Bernard.
6. Vérifie qu'un déploiement de `main` (Production) continue d'afficher les
   **vraies** données patients (aucun changement attendu côté prod).

---

## Étape 7 — Activer le job `e2e` de la CI (GitHub Actions)

Le job `e2e` de `.github/workflows/ci.yml` est déjà conditionné proprement :

```yaml
e2e:
  needs: build
  runs-on: ubuntu-latest
  if: vars.E2E_BASE_URL != ''
```

Tant que la variable de dépôt `E2E_BASE_URL` n'est pas définie, ce job est
**ignoré silencieusement** (la CI reste verte avec juste le job `build`).
Pour l'activer, va sur **GitHub > ton dépôt > Settings > Secrets and
variables > Actions**, et ajoute :

### Onglet "Variables" (valeurs non secrètes)

| Nom | Valeur |
|---|---|
| `E2E_BASE_URL` | URL d'un déploiement Preview Vercel branché sur `horizon-staging` (ex : `https://mouvtrack-xxxxx.vercel.app`) |
| `E2E_PRATICIEN_EMAIL` | `staging.praticien@example.com` |
| `E2E_PATIENT_CODE` | `CAME2E26` |
| `E2E_PATIENT_PRENOM` | `Camille` |
| `E2E_PATIENT_NOM` | `Martin` |
| `E2E_PATIENT_CODE_2` | `JUNE2E27` |
| `E2E_PATIENT_PRENOM_2` | `Julien` |
| `E2E_PATIENT_NOM_2` | `Bernard` |
| `E2E_STRUCTURE_TOKEN` | `staging-token-demo-0001` |

(Les 7 dernières variables ont déjà des valeurs par défaut dans le code —
voir `e2e/README.md` — donc strictement seules `E2E_BASE_URL` et
`E2E_PRATICIEN_EMAIL`/`E2E_PRATICIEN_PASSWORD` sont indispensables ; les
ajouter explicitement reste recommandé pour que la CI ne dépende pas de
valeurs implicites.)

### Onglet "Secrets" (valeur sensible)

| Nom | Valeur |
|---|---|
| `E2E_PRATICIEN_PASSWORD` | le mot de passe choisi à l'étape 3 pour `staging.praticien@example.com` |

Une fois `E2E_BASE_URL` défini, le job `e2e` se déclenchera automatiquement
sur le prochain push / PR.

⚠️ **Attention "preview Vercel branché sur `horizon-staging`"** :
`E2E_BASE_URL` doit pointer vers un déploiement Preview dont les variables
d'environnement (`VITE_SUPABASE_URL`, etc.) sont bien celles de l'Étape 5 —
c'est-à-dire **n'importe quel déploiement Preview**, puisque Vercel applique
automatiquement les variables "Preview" à toutes les branches non-`main`. Une
URL fixe (ex : celle d'une branche dédiée que tu redéploies) est plus stable
qu'une URL de PR qui change à chaque fois.

---

## Étape 8 (optionnel) — Cron de rappels sur staging

Le reste de l'application fonctionne **sans** cette étape (les rappels
automatiques ne seront simplement jamais envoyés sur staging). Ne fais cette
étape que si tu veux tester spécifiquement la fonctionnalité "rappels
automatiques" (notifications push) — voir `RAPPORT_RAPPELS.md` pour le
contexte complet.

1. **Générer une paire de clés VAPID dédiée à staging** (ou réutiliser celle
   de prod) :
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Sur Vercel (Preview uniquement, comme à l'Étape 5), ajoute :
   - `VITE_VAPID_PUBLIC_KEY` (clé publique générée)
   - `VAPID_PRIVATE_KEY` (clé privée générée)
   - `VAPID_CONTACT_EMAIL` (ex : `mailto:lorenzo.community@gmail.com`)
   - `CRON_SECRET` : une chaîne aléatoire **différente** de celle de
     production (ex : `openssl rand -hex 32`)
3. Redéploie la Preview pour que ces variables soient prises en compte, et
   note son URL (`<VOTRE_URL_VERCEL>` ci-dessous).
4. Si tu ne l'as pas déjà fait à l'Étape 2.2 (item 9) : ouvre
   `supabase/migrations/20260616_cron_rappels_patients_staging.sql`, fais-en
   une **copie**, remplace `<VOTRE_URL_VERCEL>` et `<VOTRE_CRON_SECRET>` par
   les valeurs ci-dessus, colle la copie dans le **SQL Editor de
   `horizon-staging`**, clique **Run**.
   - Ce script crée un job pg_cron nommé `rappels-patients-horaire-staging`
     (nom différent du job de production `rappels-patients-horaire`, par
     précaution).
5. Vérifie : `SELECT jobid, jobname, schedule, active FROM cron.job;` doit
   montrer une ligne `rappels-patients-horaire-staging`, `5 * * * *`,
   `active = true`.

---

## Récapitulatif des garde-fous respectés

- Aucune commande SQL n'a été exécutée par Claude (ni sur prod, ni sur
  staging — qui n'existe pas encore).
- Aucun projet Supabase ni variable Vercel n'a été créé par Claude — tout est
  documenté ci-dessus pour Lorenzo.
- Branche de travail : `setup-staging`. Aucun push/merge vers `main`.
