# Plan bêta — points à traiter avant ouverture

## CE FICHIER EST LA SEULE RÉFÉRENCE DE SUIVI — il n'existe pas de « plan en N étapes »

**Ce document plus ce qui est prouvable depuis git : rien d'autre ne fait
foi. Il n'existe aucun plan numéroté de 0 à N, ni ici ni ailleurs dans le
dépôt.**

Écrit le 2026-09-03, après un audit d'état mené en croyant qu'un plan en
7 étapes (0 à 6) figurait dans ce fichier. Il n'y figure pas, et n'y a
jamais figuré. Vérifié :

- les titres de ce fichier — aucun n'est une étape numérotée ;
- ses **21 révisions** depuis sa création (`git log --all -- docs/PLAN-BETA.md`)
  — aucune n'a jamais porté de « Étape 0 » ;
- **toutes** les branches locales et distantes, tous les `.md` du dépôt —
  aucune occurrence.

La numérotation existe, mais **uniquement dans les messages de commit et
les titres de PR** : « Étape 1, lot N » (lots de sécurité F-xx), « Etape 3 »
(`user_roles`), « Etape 4 » (administration des comptes), « Etape 6 »
(retrait de l'identité du premier utilisateur). Il n'y a jamais eu d'étape
0, 2 ni 5 — ce sont des cases vides d'une numérotation reconstituée après
coup, pas des chantiers oubliés.

### Pourquoi c'est noté ici plutôt que corrigé en silence

Un plan qui n'existe que dans le souvenir d'une conversation se comporte
comme un plan réel : on s'y réfère, on s'en sert pour décider quoi faire
ensuite, et on lui attribue des contenus qu'il n'a jamais eus. Le
2026-09-03, l'« étape 2 » retenue de mémoire portait deux sujets — des clés
étrangères manquantes, et un verrou d'écriture sur `tm6_variantes` réservé
à `service_role`. Le second décrit la **première version, abandonnée**, de
`20260817_securite_01_tm6_variantes_rls.sql` : le modèle réellement appliqué
est un propriétaire par ligne, la version `service_role` ayant été réécrite
le 2026-08-19 parce qu'elle cassait `useTm6Variantes.ts`. Un mois de travail
séparait le souvenir de la réalité, sans que rien ne le signale.

**La règle qui en découle** : ce qui doit survivre à une session s'écrit
ici. Un chantier qui n'est ni dans ce fichier, ni dans un commit sur `main`,
ni dans une PR ouverte, n'existe pas — quelle que soit la netteté du
souvenir qu'on en a. Voir l'inventaire plus bas : quatre IDOR sont restés
ouverts en production jusqu'au 2026-09-03 alors que deux d'entre eux étaient
« corrigés » depuis le 2026-08-19 — sur une branche que rien ne suivait, et
dont aucun chantier de ce fichier ne mentionnait le contenu.

## CHANTIER À PART — nettoyage de deux tests e2e (noté le 2026-09-14, pas pour aujourd'hui)

`02-creation-patient` et `10-creation-contrat` échouent **sur `main` lui-même**,
indépendamment de toute PR (run 34843780251, commit `44473ae`). Tant qu'ils sont
rouges, aucune PR ne peut afficher une CI verte, et chaque merge demande un
arbitrage manuel « est-ce ma PR ou le fond ? ». C'est le coût réel de les
laisser en l'état, plus que les deux tests eux-mêmes.

**Ce ne sont pas des régressions applicatives.**

| Test | Échoue sur | Nature |
|---|---|---|
| `10-creation-contrat` | `getByText(/Contrat créé\. Allez sur Tournée/)` introuvable | Le test affirme un comportement que **son propre commentaire décrit comme disparu** (« Ce test affirmait encore l'ancien comportement — il décrivait un produit qui n'existe plus », lignes 17-18). Le commentaire a été écrit, l'assertion pas corrigée |
| `02-creation-patient` | toast `« {prénom} {nom} ajouté(e) ! »` introuvable | La fiche EST créée — le clic sur « Créer la fiche » réussit, l'échec porte sur le toast de confirmation. À vérifier : le texte a-t-il changé, ou le toast a-t-il disparu ? Les deux demandent des correctifs opposés |

**À ne pas confondre avec `07-seance-coche-exercice`**, qui échoue par
intermittence pour une raison différente et déjà documentée : l'index unique
`seances_patient_no_double_validation_idx` rend le test non rejouable dans la
même journée, et `staging-reset-etat-e2e.ts` ne protège pas de plusieurs runs
concurrents contre une seule base de staging. Quatre runs le 2026-09-14 ont
suffi à le faire tomber. Ce n'est pas le même chantier.

**Règle qui s'applique ici** : un test qui décrit un produit qui n'existe plus
est pire qu'un test absent — il occupe la place d'une vérification réelle tout
en signalant en permanence une panne qui n'en est pas une. Corriger l'assertion
sans vérifier ce que fait vraiment le produit reviendrait à déplacer le
problème : commencer par constater le comportement actuel, puis écrire ce qu'on
constate.

## POINT DE REPRISE — 2026-09-14 (chantier « fiche bénéficiaire + RGPD » clos)

**Mis à jour le 2026-09-14 au soir** (migrations staging, e2e local, Apley).
**Reprise prévue sur le PC portable**, pas sur la machine de bureau : lire la
section 0 avant toute commande.

### 0. REPRISE SUR UNE AUTRE MACHINE — avant toute commande

1. `git pull` sur `main`, puis `npm ci` et `npx playwright install chromium`.
2. **`.env.test.local` n'existe pas sur le portable.** Il n'est pas dans git
   (`.gitignore:24`) et les secrets GitHub ne sont **jamais relisibles**
   (`gh secret list` ne donne que les noms). Deux façons de le recréer :
   - le copier depuis la machine de bureau par un canal sûr (gestionnaire de
     mots de passe), jamais par mail ni dans une conversation ;
   - ou reprendre chaque valeur à sa source : Supabase staging
     (`nnfkchhtjrferxnwlcxp` : URL, clés anon et service_role, URL du pooler
     port 6543), Vercel `horizon-app` > Settings > Deployment Protection >
     Protection Bypass for Automation. Les valeurs non secrètes
     (`E2E_BASE_URL`, e-mail praticien, codes patient) sont dans
     `gh variable list`.

   Clés attendues : `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`,
   `SUPABASE_TEST_SERVICE_ROLE_KEY`, `PATIENT_SESSION_SECRET`,
   `STAGING_DATABASE_URL`, `E2E_BASE_URL`, `E2E_PRATICIEN_EMAIL`,
   `E2E_PRATICIEN_PASSWORD`, `VERCEL_AUTOMATION_BYPASS_SECRET`,
   `E2E_PATIENT_CODE`, `E2E_PATIENT_CODE_2`.
3. **Une clé = une ligne.** Les scripts (`loadEnvFile`) gardent la
   **dernière** occurrence d'une clé en double. Constaté ce soir : une
   ancienne `STAGING_DATABASE_URL` recopiée en fin de fichier masquait la
   bonne, et toute connexion échouait en « Authentication credentials are
   invalid ». Même situation pour `E2E_PRATICIEN_PASSWORD`. Corrigé sur la
   machine de bureau ; à ne pas reproduire en recréant le fichier.
4. **Playwright ne lit pas `.env.test.local`** (seuls les scripts `tsx` le
   font). Lancer la suite ainsi :
   `node --env-file=.env.test.local node_modules/@playwright/test/cli.js test`
5. **Avant chaque suite** : `npx tsx scripts/staging-reset-etat-e2e.ts --apply`
   (comme `ci.yml:174`). Et **jamais deux suites à moins de 15 minutes** :
   06, 07 et 11 consomment trois connexions patient sur un quota de
   5 / 15 min / IP — le second run fait tomber 11 en « Trop de tentatives ».
6. Les deux stashes ne sont que sur la machine de bureau ; leurs sauvegardes
   sont sur GitHub (section 6).

### 1. PREMIER SUJET AU RETOUR — PR #50 Apley Scratch Test

Branche `apley-persistance`, commit `87293be` : migration
`20260914_apley_scratch_test_bilans.sql` (`apley_data JSONB`), deux lignes dans
`src/lib/mappers.ts`, et `src/lib/mappers.test.ts` qui fait l'aller-retour des
14 clés de `ALL_TESTS` (ensemble exact).

- **Staging : appliquée le 2026-09-14 au soir**, par script. Avant : colonne
  absente. Vérification par requête séparée : `apley_data` de type `jsonb`,
  0 bilan sur 3 modifié. Contre-épreuve : la même requête renvoie 0 pour une
  colonne fictive. Vue par PostgREST (le chemin réel de l'enregistrement) :
  `apley_data` → HTTP 200, colonne fictive → HTTP 400 (`42703`).
- **Production : NON appliquée.**
- **CI de la PR (run 34863890459) : e2e rouge.** 02 et 10 relèvent du fond
  (section 3). 03 a échoué d'abord sur « Bilan enregistré ! » absent —
  cohérent avec la colonne alors manquante sur staging — puis, au second
  essai, sur le brouillon laissé par le premier (supprimé ce soir par le
  script de remise à zéro).
- **Non prouvé** : que 03 passe avec le code Apley. Le run local de ce soir
  visait la branche `staging`, identique à `main`, donc **sans** ce code.

Ordre à suivre :

1. Relancer l'e2e de la PR : `gh run rerun 34863890459 --failed`. Attendu :
   seuls 02 et 10 rouges, 03 vert.
2. Appliquer la migration en **production** (SQL Editor), puis la vérification
   et la contre-épreuve écrites dans le fichier de migration.
3. Merger #50 **seulement ensuite** (règle « migration en production AVANT le
   merge » : le code écrit `apley_data`, son absence ferait échouer tout
   enregistrement de bilan).
4. Recette : saisir un Apley, enregistrer, rouvrir le bilan.

Les saisies Apley passées sont perdues : elles n'ont jamais quitté le
navigateur.

### 2. Migrations — état au 2026-09-14 au soir

| Migration | Production | Staging |
|---|---|---|
| `20260913_rgpd_consentement_creation.sql` (PR #44) | Appliquée (par Lorenzo) : vérification `1 \| 7 \| 0`, contre-épreuve `CONFORME (4/4)` | Appliquée (par script) : `1 \| 7 \| 0`, 0 fiche d'essai restante, `CONFORME (4/4)` |
| `20260914_retrait_visibilite_progression.sql` (PR #46) | Appliquée (par Lorenzo) **après** le merge de #46 et le déploiement — ordre inversé volontaire, le code ne lisant plus la clé. `onglet_masque = 0`, `UPDATE 27`, vérification à 0, contre-épreuve 27/27 | Appliquée le soir par script. Avant : 5 lignes sur 5 avec la clé. Après : 0, nouveau défaut sans `progression`, autres réglages identiques sur 5/5 lignes comparées à une sauvegarde. Contre-épreuve : le même contrôle trouve bien les 5 clés sur la sauvegarde d'avant |
| `20260914_apley_scratch_test_bilans.sql` (PR #50, non mergée) | **Non appliquée** | Appliquée et vérifiée (section 1) |

Autres faits vérifiés du jour :

- **PR #44 mergée** (`9f781b4`), déploiement de production Ready sur
  `app.horizon-suivi.fr`. Les `consentementDate` trompeuses des 7 fiches sont
  effacées ; leur consentement manque toujours (badge « RGPD ⚠ »).
- **Titre du praticien e2e** : l'hypothèse du matin était la bonne.
  `staging.praticien2@example.com` n'avait pas de `titre` et partait sur
  `/onboarding`. Corrigé (PR #48 + `staging-renseigner-titre-praticien.ts`) ;
  relu ce soir à blanc : `titre = "Enseignant APA"`, rien à faire.

### 3. Tests e2e — état au 2026-09-14 au soir

Run local contre `E2E_BASE_URL` (Preview de la branche `staging`, identique à
`main`), après `staging-reset-etat-e2e.ts --apply` : **14 réussis, 3 échoués,
1 non exécuté**. Les 10 échecs du matin sont résolus.

| Test | État | Cause |
|---|---|---|
| **02 création participant** | **Rouge** | Toast « … ajouté(e) ! » introuvable. Rouge aussi sur `main` en CI (run 34862690450). Chantier à part : PR #49 |
| **10 création contrat** | **Rouge** | Assertion sur « Contrat créé. Allez sur Tournée » : comportement disparu. Rouge aussi sur `main`. PR #49 |
| 11 rappels patient | Rouge **ce run-là seulement** | « Trop de tentatives » : second run à moins de 15 min du premier, où 11 était vert. Pas une régression |
| 09 limitation connexion | Non exécuté | Voulu : dépend du projet `principal`, qui a des échecs |
| 03 bilan, 07 séance | Verts | Rouges au premier run faute de remise à zéro (brouillon de la CI #50, séance du jour déjà validée) |

**Toujours non prouvé par l'e2e** : le blocage de création sans consentement
(02 échoue sur le toast, après la création).

Point à instruire avec la PR #43 : son texte dit le bloc 4 (suppression des
fiches `Test E2E…`) « ajouté et exécuté le 2026-09-08 », mais le script sur
`main` n'a que 3 blocs — la PR n'est pas mergée. 02 recrée donc une fiche à
chaque run.

### 4. Ce qui n'est PAS vérifié — harnais de sécurité

**Pas relancé depuis le matin.** Le mot de passe praticien est maintenant
dans `.env.test.local` : relancer `npm run test:security`, en vérifiant
l'e-mail utilisé (voir le piège de « Le compte `staging.praticien@example.com`
est hors service »).

Run local du 2026-09-14 au matin contre staging, **sans** `E2E_PRATICIEN_PASSWORD` :
**22 réussis, 42 ignorés, 1 suite en échec**. Le `beforeAll` du bloc
« Cloisonnement RLS multi-tenant » s'arrête à la connexion du praticien A
(`Invalid login credentials`), ce qui fait ignorer tout le bloc :

- 20 tests praticien A ↔ B (tables à `praticien_id`) ;
- 2 tests patient A ↔ B, 1 test structure ↔ patient non rattaché ;
- 7 tests de tables protégées par jointure ;
- 2 tests `audit_logs` append-only ;
- 4 tests `[F-01]` `tm6_variantes` ;
- 4 tests `[RÔLES]` `user_roles` ;
- 1 test `[F-11]` ;
- 1 test de couverture complète.

Ont tourné et réussi : les 13 « Findings structurels » (connexion Postgres
directe) et les 9 `[RÔLES]` du compte admin.

**Point précis resté non exercé** : la création du participant B avec
`rgpd`, modifiée pour le trigger (`rls.spec.ts`), se situe après la
connexion qui a échoué. À relancer avec le mot de passe **et** le bon
e-mail — voir le piège noté dans « Le compte `staging.praticien@example.com`
est hors service ».

### 5. PR ouvertes au 2026-09-14 au soir

| PR | Branche | Ouverte le | Objet |
|---|---|---|---|
| #50 | `apley-persistance` | 2026-09-14 | Apley Scratch Test — **prochain chantier**, section 1 |
| #49 | `note-nettoyage-tests-e2e` | 2026-09-14 | Documentation seule : chantier 02 / 10 |
| #43 | `e2e-nettoyage-participants` | 2026-09-08 | Bloc 4 du script de remise à zéro (fiches `Test E2E…`) + note |
| #42 | `securite-f02-code-acces-csprng` | 2026-09-08 | [F-02] code d'accès bénéficiaire tiré par un générateur non cryptographique |
| #28 | `message-praticien-renommage` | 2026-08-31 | `messagePierre` → `messagePraticien`, migration coordonnée **non appliquée** |

### 6. Rien ne reste en local

Vérifié le 2026-09-14 au soir sur la machine de bureau : `git status` propre,
`git log --branches --not --remotes` vide, et 0 commit propre sur chacune des
16 branches locales sans suivi. Les branches marquées « ahead »
(`frequence-contrat`, `optim-agenda-phase1`, `staging`) ne portent que des
commits déjà présents sur `origin/main` ou sur une branche `sauvegarde/`.

Sauvegardé sur GitHub le 2026-09-14, sans rien supprimer localement :

- `sauvegarde/staging-trigger-preview-2026-08-22` : le commit de
  déclenchement de la branche locale `staging`, sans valeur (voir le
  commentaire du job `e2e` dans `ci.yml`) ;
- `sauvegarde/stash-2026-09-12-baseline-lint-temp` : stash touchant
  `api/cron/rappels.ts`, `api/cron/renouveler-contrats.ts` et une migration
  cron. **Son contenu n'est pas identique à `main`** ;
- `sauvegarde/stash-2026-08-10-wip-tm6-settings-hds` : stash
  `Step3_EnduranceMemory.tsx`, `useTm6Variantes.ts`, `SettingsPage.tsx`.
  **Son contenu n'est pas identique à `main`**.

Les deux stashes existent encore sur la machine où ils ont été créés : à
trier, puis supprimer (`git stash drop`) une fois la sauvegarde jugée
suffisante.

### 7. Suite du chantier mobile

Voir « CHANTIER — fusion progressive mobile / desktop » plus bas.

## RÈGLE DE MÉTHODE — un contrôle compare un ensemble exact

**Un contrôle qui énumère des cas en oublie un. Comparer un ensemble exact,
jamais tester des cas un par un.**

Cette règle n'est pas théorique : elle a été écrite le 2026-08-29 après
**trois** occurrences du même défaut dans la même journée.

| # | Contrôle | Ce qu'il énumérait | Ce qu'il a manqué |
|---|---|---|---|
| 1 | Privilèges de table de `authenticated` sur `user_roles` | `INSERT`, `UPDATE`, `DELETE` | **`TRUNCATE`** — que la RLS n'intercepte jamais, et qui suffit à vider la table |
| 2 | Bénéficiaires d'`EXECUTE` sur `app_role_courant()` | `PUBLIC` seul | **`anon`**, dont la production porte un grant *nominatif* qu'un `REVOKE FROM PUBLIC` ne retire pas |
| 3 | Contrôle des skips du harnais en CI | — | Il était placé après le contrôle des échecs, qui sort en `exit(1)` : **il n'a jamais pu s'exécuter** |

Les cas 1 et 2 sont le même défaut : une liste de choses interdites, forcément
incomplète. Le cas 3 en est le voisin — un contrôle dont personne n'avait
vérifié qu'il pouvait s'exécuter, ni échouer.

### Comment appliquer la règle

**Pour des privilèges** — lire l'ACL et la comparer à l'ensemble attendu, au
lieu d'appeler `has_table_privilege()` sur une liste. Bénéfice second : ça
évite de nommer `MAINTAIN`, qui n'existe pas avant PostgreSQL 17.

```sql
SELECT string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type)
  INTO privs
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
 WHERE c.oid = 'public.<table>'::regclass
   AND a.grantee = '<role>'::regrole;
IF privs IS DISTINCT FROM '<ensemble attendu>' THEN
  RAISE EXCEPTION 'privileges de <role> = [%], attendu [<ensemble attendu>]', COALESCE(privs, 'aucun');
END IF;
```

Même forme pour les fonctions, en comparant l'ensemble des **bénéficiaires**
d'`EXECUTE` (propriétaire exclu, `grantee = 0` rendu comme `PUBLIC`).

**Pour un inventaire** — comparer dans les **deux sens** : rien d'inattendu en
base, et rien de périmé dans la liste de référence. C'est ce que fait [F-13]
avec `DETTE_PRIVILEGES_AUTHENTICATED` : sans le second sens, la liste pourrit
en silence et le test reste vert sur une réalité qui a changé.

### Corollaire — prouver que le contrôle peut échouer

Un contrôle au vert ne prouve rien tant qu'on ne l'a pas vu rougir. **Casser
délibérément la condition et vérifier le message**, avant de faire confiance
au vert.

C'est ce qui a révélé le cas 2 : l'auto-vérification de la migration
`user_roles` passait au vert avec `anon=EXECUTE`. Lire le code ne l'avait pas
montré ; retirer la ligne `REVOKE ... FROM anon` et rejouer, si.

`scripts/staging-dry-run.ts --file` sert exactement à ça : rejouer un état
défectueux reconstitué dans une transaction toujours annulée.

## ÉCART STRUCTUREL staging / production — privilèges par défaut (2026-08-29)

**Aucune vérification de privilèges (GRANT, `has_table_privilege`, ACL) faite
sur staging ne prouve quoi que ce soit sur la production.** Les deux bases ne
partent pas du même état.

Production porte des règles `ALTER DEFAULT PRIVILEGES` sur le schéma
`public`, que staging n'a pas du tout. Relevé complet du 2026-08-29 :

| `pg_default_acl` sur `public` | production | staging |
|---|---|---|
| tables/vues, règle `postgres` | `postgres`, `authenticated`, `service_role` — tous en `arwdDxtm`. **`anon` absent** | *aucune ligne* |
| séquences, règle `postgres` | `anon` absent | *aucune ligne* |
| fonctions, règle `postgres` | `postgres`, **`anon`**, `authenticated`, `service_role` — tous en `X` (EXECUTE) | *aucune ligne* |
| tables, séquences, fonctions, règle `supabase_admin` | présentes, **`anon` inclus partout** | *aucune ligne* |

Deux lectures distinctes selon le type d'objet :

- **Tables** : `anon` a bien été retiré de la règle `postgres` par
  `20260613_rls_anon_lockdown.sql`. Restent `authenticated` et
  `service_role` — c'est l'objet du chantier planifié plus bas.
- **Fonctions** : `anon` est **toujours là**. `rls_anon_lockdown` a traité
  TABLES et SEQUENCES, jamais FUNCTIONS. Toute nouvelle fonction créée dans
  `public` naît donc `EXECUTE`-able par `anon`, par un grant **nominatif**
  qu'un `REVOKE EXECUTE ... FROM PUBLIC` ne retire pas. C'est la cause
  profonde de la faille de la PR #8 : `get_praticien_structure` et
  `structure_token_valide` ne sont pas devenues ouvertes, elles sont **nées
  ouvertes**.

Conséquence directe : en production, **toute table créée par `postgres` dans
`public` naît avec l'intégralité des privilèges déjà accordée à
`authenticated`** — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
TRIGGER, MAINTAIN. Sur staging, elle naît nue. Le même fichier SQL produit
donc deux états de sécurité différents selon la base.

### Point voisin, clos le 2026-08-29 : `CREATE` sur le schéma `public`

En **production**, `public_a_create`, `anon_a_create` et
`authenticated_a_create` sont tous à `false` : la prod a bien le
comportement PostgreSQL 15+, qui a retiré `CREATE` à `PUBLIC`. **Rien à
faire.**

Sur **staging**, les trois sont à `true` (`nspacl = {postgres=UC/postgres,=UC/postgres}`).
C'est un écart de plus, mais dans le sens inoffensif : staging est plus
permissif que la prod, donc aucune vérification de prod n'est faussée par
lui. Consigné pour mémoire, non bloquant.

### Ce qui l'a révélé

`20260827_roles_01_user_roles.sql` a échoué en production sur sa propre
auto-vérification (« authenticated a un privilege d'ecriture ») — transaction
annulée, table non créée. La même migration était passée au vert sur staging,
où `user_roles` porte exactement `authenticated = SELECT`. Le `GRANT SELECT` de
la migration ne restreignait rien en production : il réaffirmait un privilège
déjà détenu, sans retirer les autres.

Reproduction vérifiée le 2026-08-29 via `scripts/staging-dry-run.ts`, en
rejouant la règle de production dans une transaction annulée : la migration
d'origine échoue avec le message exact de production, la version corrigée
(REVOKE avant GRANT) passe et donne `authenticated = SELECT` dans les deux
environnements.

### Pourquoi le chantier GRANT des 21 et 22 août est passé à côté

`20260821_grant_parity_staging.sql` et `20260822_grant_parity_staging_v2.sql`
attribuaient les 20 tables en écart au « rejeu des migrations qui ne pose que
le GRANT minimal ». La vraie cause était celle-ci, et l'hypothèse avait été
écartée à tort. Le signe qui aurait dû alerter : `20260715_evenements_agenda.sql`
ne contient **aucun** `GRANT`, et pourtant la table avait tous les privilèges en
production et aucun sur staging.

La comparaison des dumps (`supabase/_production_schema_dump.sql` vs
`_staging_schema_dump.sql`) ne pouvait pas le voir : **ces dumps ne contiennent
aucune ligne `ALTER DEFAULT PRIVILEGES`**. Une comparaison de schémas ne couvre
pas les privilèges par défaut ; il faut interroger `pg_default_acl` directement.

### Règle à appliquer tant que l'écart subsiste

Toute migration qui **crée une table dans `public`** doit poser explicitement
ses privilèges, REVOKE d'abord, GRANT ensuite :

```sql
REVOKE ALL ON TABLE public.<table> FROM PUBLIC;
REVOKE ALL ON TABLE public.<table> FROM anon;
REVOKE ALL ON TABLE public.<table> FROM authenticated;
REVOKE ALL ON TABLE public.<table> FROM service_role;

GRANT <ce qui est réellement nécessaire> ON TABLE public.<table> TO <rôle>;
```

L'ordre REVOKE-puis-GRANT rend l'état final identique dans les deux bases,
que la règle par défaut soit présente ou non. Un `GRANT` seul ne suffit pas.

Et une auto-vérification qui contrôle des privilèges doit lire **l'ACL
exacte** (`aclexplode` sur `pg_class.relacl`), jamais une liste de
`has_table_privilege()` : une liste doit énumérer les privilèges interdits et
en oublie — la première version de `user_roles` testait INSERT/UPDATE/DELETE
et laissait passer TRUNCATE, que RLS n'intercepte jamais.

### État de l'exposition aujourd'hui

Les 48 tables de `public` ont toutes RLS activée, et il n'existe aucune vue ni
vue matérialisée dans ce schéma (vérifié le 2026-08-29). Il n'y a donc pas de
table actuellement ouverte en écriture à `authenticated` sans filtre. Le risque
porte sur les **tables futures** : une table créée sans RLS, ou avec une RLS
incomplète, est entièrement ouverte à tout compte connecté sans qu'aucun
`GRANT` n'ait été écrit nulle part. TRUNCATE, en particulier, ignore les
policies : une table protégée par RLS reste vidable en totalité par `authenticated`.

### Garde-fou en place depuis le 2026-08-29

`tests/security/rls.spec.ts` porte deux tests supplémentaires :

- **[F-12]** toute table de `public` a la RLS activée. Vaut pour les deux
  bases : le schéma est le même.
- **[F-13]** `authenticated` ne détient sur `public` que du DML, hors dette
  listée dans `DETTE_PRIVILEGES_AUTHENTICATED` (46 tables au 2026-08-29). Ce
  test ne vaut **que pour staging** — une table créée par une future migration
  naîtra nue sur staging et grande ouverte en production, il ne peut pas le
  voir. Ne pas le lire au vert comme « la production est saine ».

La liste `DETTE_PRIVILEGES_AUTHENTICATED` doit se **vider**, jamais
s'allonger : c'est le décompte du chantier ci-dessous. [F-13] échoue aussi si
une entrée y devient périmée, pour que la dette ne pourrisse pas en silence.

## CHANTIER PLANIFIÉ — retirer la règle de privilèges par défaut

**Décidé sur le principe le 2026-08-29. À faire APRÈS le chantier des rôles,
AVANT l'ouverture bêta.** Pas avant : cette opération change le mode d'échec
de toutes les migrations à venir, elle demande une fenêtre calme.

### Ce qu'il faut faire, exactement

Le chantier a **deux volets**, découverts à deux moments différents. Les
traiter dans la même migration.

**Volet 1 — tables et séquences, pour `authenticated`.**

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
```

**Volet 2 — fonctions, pour `anon`. C'est le trou laissé par
`20260613_rls_anon_lockdown.sql` en juin :** cette migration a traité TABLES
et SEQUENCES, jamais FUNCTIONS. Confirmé en production le 2026-08-29.

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

À traiter avec au moins autant de sérieux que le volet 1 : c'est la cause
profonde de la faille de la PR #8. Sans lui, chaque nouvelle fonction de
`public` naît exécutable par `anon`, et il faut y penser à la main à chaque
fois — exactement ce qui a échoué en juin.

⚠️ **Un `REVOKE EXECUTE ... FROM PUBLIC` ne suffit pas** et ne remplace pas
ce volet : le grant à `anon` est **nominatif**. Vérifié par simulation le
2026-08-29 — une migration à laquelle il ne manquait que le
`REVOKE ... FROM anon` passait au vert avec `anon=EXECUTE`.

**Tant que le volet 2 n'est pas fait**, toute migration créant une fonction
dans `public` doit poser les deux REVOKE, dans cet ordre :

```sql
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM anon;
GRANT  EXECUTE ON FUNCTION public.<fn>() TO <rôles qui en ont besoin>;
```

⚠️ **Jamais sur `service_role`.** Les routes `api/` s'appuient dessus ; le lui
retirer casserait la production immédiatement. Ni sur `postgres`, propriétaire.

### Limite dure : la règle `supabase_admin` est intouchable

Il existe pour chaque type d'objet une **seconde** règle, portée par
`supabase_admin`, qui inclut `anon` partout. Elle ne peut pas être modifiée
depuis le SQL Editor : `postgres` n'est pas superutilisateur
(`rolsuper = false`, vérifié le 2026-08-29) et n'est pas membre de
`supabase_admin`. La tentative renvoie
`permission denied to change default privileges`.

Ce n'est pas bloquant — voir « la règle `supabase_admin` est-elle active ? »
ci-dessous : elle ne s'applique à aucun objet applicatif. Mais il faut le
savoir avant d'écrire la migration, sinon elle échouera.

### La règle `supabase_admin` est-elle active en pratique ?

**Non, pour tout ce qui nous concerne.** `ALTER DEFAULT PRIVILEGES` est scopé
`FOR ROLE` : une règle ne s'applique qu'aux objets créés **par ce rôle**.
Inventaire complet du schéma `public` (staging, 2026-08-29) :

| type d'objet | nombre | propriétaire |
|---|---|---|
| tables | 48 | `postgres` |
| séquences | 5 | `postgres` |
| index | 89 | `postgres` |
| fonctions | 10 | `postgres` |

**Aucun objet de `public` n'appartient à `supabase_admin`.** Le SQL Editor,
les migrations et le Studio créent tous en tant que `postgres` : c'est la
règle `postgres` qui s'applique, et c'est bien elle qu'il faut corriger.

Seule nuance repérée : l'extension `pg_net` est enregistrée avec
`extnamespace = public` et appartient à `supabase_admin`, mais ses objets
vivent en réalité dans le schéma `net`, pas dans `public`. Elle ne déclenche
donc pas la règle sur `public`. Voir toutefois le point ouvert ci-dessous.

Puis, dans la même migration, nettoyer la dette déjà matérialisée sur les
tables existantes — le `ALTER DEFAULT PRIVILEGES` seul n'a **aucun effet
rétroactif** :

```sql
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
```

Et vider `DETTE_PRIVILEGES_AUTHENTICATED` dans `tests/security/rls.spec.ts`
**dans la même PR** — sinon [F-13] échoue sur des entrées périmées, ce qui est
le comportement voulu.

### Pourquoi c'est le bon arbitrage

Garder la règle, c'est risquer une panne **silencieuse** : une table
discrètement ouverte en écriture à tout compte connecté, sans qu'aucun `GRANT`
n'ait été écrit nulle part, donc sans rien à repérer en revue de PR. La
retirer, c'est risquer une panne **bruyante** : `42501 permission denied`,
visible à la première requête. Pour un projet à un seul développeur avant une
bêta, le mode d'échec bruyant vaut nettement mieux.

Le précédent existe déjà dans le dépôt : `20260613_rls_anon_lockdown.sql`
(section 3) a fait exactement cela pour `anon` le 13 juin, et rien n'a cassé.
C'est pourquoi `anon` n'apparaît pas dans la ligne `pg_default_acl` de
production, alors que la configuration Supabase par défaut l'y place.

Bénéfice second : la production rejoint l'état de staging, ce qui **supprime
l'écart structurel** décrit plus haut au lieu de le contourner migration après
migration.

### Ce que ça cassera, et qu'il faut accepter

1. **Toute future migration créant une table sans `GRANT` explicite.** Le style
   `20260715_evenements_agenda.sql` (zéro `GRANT`) donnera une table
   inaccessible : PostgREST répondra `42501`, et les policies ne seront même
   jamais évaluées. C'est précisément le gabarit REVOKE-puis-GRANT ci-dessus
   qui l'évite.
2. **Toute table créée via le Studio Supabase.** Elle naîtra nue.
   `20260620_seances_autonomes.sql` documente déjà un incident de cette
   famille.

Aucune table existante ne sera affectée par le `ALTER DEFAULT PRIVILEGES`
lui-même : il n'agit qu'à la création. Seul le `REVOKE ... ON ALL TABLES`
touche l'existant, et il ne retire que TRUNCATE / REFERENCES / TRIGGER, qu'aucun
code applicatif n'utilise.

### Point ouvert, à instruire séparément : `pg_net` et le schéma `net`

Repéré en passant le 2026-08-29, **hors périmètre bêta**, consigné pour ne
pas le perdre.

Sur staging : `anon` a `USAGE` sur le schéma `net` **et** `EXECUTE` sur
`net.http_post`. Les fonctions de `pg_net` n'ont aucune ACL explicite, donc
l'ACL par défaut de PostgreSQL s'applique : `EXECUTE` à `PUBLIC`. Une
primitive de requête HTTP sortante accessible à un rôle non authentifié,
c'est un SSRF potentiel.

**Ce n'est pas établi comme atteignable.** PostgREST n'expose que les schémas
de sa configuration (`public`, `graphql_public` par défaut chez Supabase) ;
`net` n'en fait normalement pas partie, et un appel REST vers une fonction
d'un schéma non exposé renvoie 404. Je n'ai **pas pu le confirmer depuis la
base** : cette configuration ne vit pas dans Postgres (rien dans
`pg_db_role_setting`), elle est portée par la plateforme.

C'est la configuration Supabase standard, présente dans tout projet. À
instruire pour ce qu'elle est — une vérification de la liste des schémas
exposés, et un contrôle qu'aucune fonction `SECURITY INVOKER` de `public`
n'appelle `net.*` — pas comme une urgence.

### Nuance mesurée le 2026-08-29, à ne pas surestimer

Sur une table à RLS activée sans policy d'écriture, `UPDATE` et `DELETE`
échouent « à vide » (0 ligne, sans erreur) même quand le privilège est
présent : la RLS filtre les lignes. Le privilège excédentaire ne donne donc
**pas** d'accès aux données tant que la RLS est correcte.

Le vrai trou est **TRUNCATE**, que la RLS n'intercepte jamais : vérifié par
contre-épreuve, il réussit sur une table protégée par RLS. Son exploitation
reste toutefois limitée — PostgREST n'expose pas `TRUNCATE`, il faudrait une
connexion Postgres directe ou une fonction `SECURITY INVOKER` mal écrite.
L'argument décisif reste donc la défense en profondeur et le mode d'échec, pas
une faille exploitable aujourd'hui.

## BUG DE PRODUCTION — la réinitialisation de mot de passe ne fonctionnait pas (2026-08-29)

> **Résolu le 2026-08-29**, après TROIS défauts distincts empilés :
> 1. aucun SMTP personnalisé — corrigé en branchant **Brevo** ;
> 2. le **suivi des clics** de Brevo détruisait le fragment portant le jeton
>    (voir la règle dédiée plus bas) — désactivé sur les transactionnels ;
> 3. la page de définition du mot de passe **n'avait jamais été écrite** —
>    `/reset-password` n'existait pas dans le routeur, alors que
>    `ForgotPasswordPage` y renvoyait depuis toujours.
>
> Chacun masquait le suivant : corriger le SMTP révélait le tracking, et
> corriger le tracking révélait la page manquante. Le récit ci-dessous est
> conservé tel qu'il a été écrit — il documente le premier défaut.

**Ce n'est pas un risque futur, c'est une panne actuelle.** Confirmé le
2026-08-29 : aucun SMTP personnalisé n'est configuré sur le projet Supabase de
production (le formulaire est vide, et le dashboard propose d'augmenter la
limite à 30/h *après* activation d'un SMTP personnalisé).

Le service d'email intégré de Supabase n'est pas prévu pour la production :
plafond de quelques envois par heure, et livraison restreinte aux adresses des
membres de l'organisation Supabase.

Conséquence concrète : **si un praticien oublie son mot de passe, il ne reçoit
rien.** `src/pages/ForgotPasswordPage.tsx` appelle `resetPasswordForEmail()`,
l'application affiche un message de succès, et l'email n'arrive jamais. Panne
silencieuse côté utilisateur, invisible côté exploitant. Les tests passés ont
pu réussir : l'adresse utilisée était celle du propriétaire du projet, donc
membre de l'organisation.

### Pourquoi ça bloque aussi l'étape 4

L'onboarding par invitation retenu pour l'étape 4 (`inviteUserByEmail`) passe
par le même mailer. Sans SMTP réel, une invitation envoyée à un vrai praticien
échouerait exactement de la même façon — silencieusement.

**Brancher un SMTP est donc un prérequis de l'étape 4, et un correctif de bug
à part entière, indépendamment de l'étape 4.** Aucune ligne de l'invitation
n'a été écrite tant que ce point n'est pas réglé.

### Vérifier après correction

Lancer une réinitialisation depuis une adresse **non liée** au compte Supabase
(adresse jetable, ou celle d'un tiers). Si le mail arrive, le SMTP est en
place. C'est le seul test qui prouve quelque chose — tester avec sa propre
adresse réussirait même en configuration par défaut.

## LES TESTS UNITAIRES NE TOURNAIENT PAS EN CI — réglé le 2026-08-29

`npm run test:unit` (`vitest run`, qui couvre `api/**/*.test.ts`,
`src/lib/**/*.test.ts`, `src/utils/**/*.test.ts`) **n'est appelé par aucun
workflow**. La CI exécute `build`, `typecheck:api`, `typecheck:e2e`,
`test:e2e`, et `vitest run tests/security` — jamais le reste.

Conséquence constatée le 2026-08-29 : **3 tests de
`api/_lib/patientSession.test.ts` sont en échec** (`accesViaPraticien`,
`TypeError: supabase.rpc is not a function`) et personne ne l'a vu. Ils
échouent aussi sur un arbre propre : ce n'est pas une régression récente.

C'est le même vert silencieux que le workflow `security.yml` combat
explicitement pour le harnais RLS, mais sur l'autre moitié des tests.

### Réglé le 2026-08-29, dans cet ordre

Les 3 tests ont été corrigés **avant** l'ajout de l'étape, pour que la CI ne
passe jamais par un état rouge et que la liste des échecs acceptés reste vide.

**Ce n'était pas un simple stub oublié.** Le faux client Supabase du test
décrivait l'ANCIENNE implémentation d'`accesViaPraticien`, où la propriété se
vérifiait en lisant `participants.praticien_id`. La fonction passe depuis par
`acces_participant_pour()`, qui accorde l'accès au propriétaire **ou** à un
membre actif de l'organisation active du participant. Les tests affirmaient
donc une sémantique que le code n'avait plus : même réparés d'un stub, ils
n'auraient rien protégé. Ils ont été réécrits sur le comportement réel, et
deux tests ajoutés — dont un qui vérifie que l'identité de l'appelant vient
bien du JWT vérifié et jamais d'une valeur d'entrée, ce qu'aucun ne faisait.

**L'étape ajoutée est `npm run test:unit:ci`, pas `test:unit`.** Le second
inclut aussi `tests/security/`, qui a son propre job `audit` avec les secrets
de staging. Sans ces secrets dans le job `build`, le harnais s'auto-skiperait :
64 tests comptés verts sans rien vérifier. L'exclusion rend la frontière
explicite — chaque job ne fait tourner que ce qu'il peut réellement prouver.

État : `build` exécute désormais `build`, `typecheck:api`, `typecheck:e2e` et
`test:unit:ci` (17 fichiers, 260 tests, **zéro skip**).

## SUPPRIMER UN COMPTE PRATICIEN — ce que ça fait vraiment (2026-08-29)

**La règle « jamais de suppression de compte » est juste. Le raisonnement qui
la justifiait était faux, et la réalité est pire que ce qu'il décrivait.**

On croyait : « les FK sont en `ON DELETE CASCADE`, supprimer un praticien
détruirait le dossier patient ». Audit des 21 FK pointant vers `auth.users` :

| Effet réel | Tables |
|---|---|
| **CASCADE** — la ligne est supprimée | `praticiens`, `user_roles`, `indisponibilites`, `evenements_agenda`, `zones_geographiques`, `rappel_preferences`, `programmes_modeles`, `dossier_exercice_membres`, `organisation_membres` |
| **SET NULL** — la ligne SURVIT, orpheline | `participants`, `bilans`, `comptes_rendus_seances`, `notes_seances`, `contrats`, `programmes`, `seances`, `retours_seance`, `exercices_libres_activations`, `tests_etalons_activations`, `organisation_invitations` |

Le dossier patient n'est **pas** en CASCADE. Il est en SET NULL.

### Pourquoi c'est pire qu'une suppression

Toutes les policies de ces tables filtrent sur `praticien_id = auth.uid()`, ou
passent par `acces_participant()` qui retombe sur `participants.praticien_id`.
Avec `praticien_id` à NULL, **aucune de ces conditions ne peut plus être vraie
pour qui que ce soit**. Les lignes existent, aucun compte authentifié ne peut
plus jamais les lire. Seul `service_role` y accède encore.

Une suppression se voit : la donnée a disparu, on le constate. Un orphelinage
ne se voit pas : la base répond « 0 ligne », exactement comme si le praticien
n'avait jamais rien saisi. Pour une obligation de conservation du dossier
patient, c'est le pire des deux — la donnée est légalement conservée et
pratiquement perdue, sans le moindre signal.

### Conséquences

1. **L'interface admin n'expose aucun chemin de suppression.** Pas « masqué »,
   pas « protégé par confirmation » : inexistant. La désactivation se fait par
   bannissement du compte auth (`banned_until`), qui est réversible et ne
   touche à aucune donnée.
2. **Toute suppression déjà faite doit être recherchée.** Un compte supprimé
   par le passé a pu laisser des orphelins invisibles. Requête de contrôle à
   lancer en production :

```sql
SELECT 'participants'           AS t, count(*) FROM public.participants           WHERE praticien_id IS NULL
UNION ALL SELECT 'bilans',                count(*) FROM public.bilans                  WHERE praticien_id IS NULL
UNION ALL SELECT 'comptes_rendus_seances', count(*) FROM public.comptes_rendus_seances WHERE praticien_id IS NULL
UNION ALL SELECT 'notes_seances',          count(*) FROM public.notes_seances           WHERE praticien_id IS NULL
UNION ALL SELECT 'contrats',               count(*) FROM public.contrats                WHERE praticien_id IS NULL
UNION ALL SELECT 'programmes',             count(*) FROM public.programmes              WHERE praticien_id IS NULL
UNION ALL SELECT 'seances',                count(*) FROM public.seances                 WHERE praticien_id IS NULL
ORDER BY 1;
```

   Tout compte non nul désigne des lignes que plus personne ne peut lire. Elles
   sont récupérables (réassignation du `praticien_id` par `service_role`), mais
   encore faut-il savoir qu'elles existent.
3. **À reconsidérer plus tard, hors bêta :** `ON DELETE RESTRICT` sur ces FK
   ferait échouer bruyamment toute suppression de praticien portant un dossier,
   au lieu de l'orpheliner en silence. C'est le bon mode d'échec, mais ça change
   le comportement de la base — pas pendant l'ouverture.

## RÈGLE — jamais de suivi des clics sur les emails d'authentification

**Le suivi des clics d'un routeur d'emails (Brevo, Mailchimp, SendGrid…)
détruit tout lien d'authentification Supabase. Ce n'est pas un réglage à
ajuster : c'est une incompatibilité de principe.**

### Pourquoi c'est structurel, et pas un bug à contourner

Supabase renvoie le jeton dans le **fragment** de l'URL :

```
https://app.horizon-suivi.fr/reset-password#access_token=…&type=recovery
```

Tout ce qui suit le `#` n'est **jamais transmis au serveur** — c'est le
fonctionnement du Web, pas une particularité de Supabase. Le fragment n'existe
que dans le navigateur.

Le suivi des clics réécrit le lien vers un domaine de traçage
(`r.mail.horizon-suivi.fr/tr/cl/…`) qui enregistre le clic puis renvoie une
redirection HTTP vers la destination. Ce serveur n'a jamais vu le fragment :
il ne peut donc pas le réémettre. **Le jeton disparaît entre le clic et
l'arrivée.**

Aucune configuration ne répare ça. Ni la liste des Redirect URLs, ni le
template. La seule issue est de désactiver le suivi des clics sur les emails
transactionnels.

### Pourquoi ça a coûté cher à diagnostiquer (2026-08-29)

La panne est silencieuse de bout en bout :

- Brevo signale l'email **délivré**, et le clic **enregistré** ;
- le navigateur arrive bien sur le bon domaine ;
- l'application affiche la page de connexion, sans erreur ;
- aucune trace nulle part.

Trois hypothèses avaient été formulées — page manquante, Redirect URLs, lien
expiré — et **aucune n'était la bonne**. C'est l'URL d'atterrissage réelle,
relevée dans la barre d'adresse, qui a tranché : elle pointait sur le domaine
de traçage.

**Leçon de méthode : devant un flux de redirection qui échoue, relever l'URL
réellement atteinte avant de raisonner sur la configuration.** Les hypothèses
se testent en une seconde avec la donnée, et se discutent une heure sans elle.

### Portée

Vaut pour **tous** les emails d'authentification, pas seulement la
réinitialisation : invitation (`admin.inviter`), lien magique, confirmation
d'adresse. Tous portent leur jeton dans le fragment.

À revérifier à chaque changement de routeur d'emails, et après toute
modification des réglages d'un routeur existant — le suivi des clics est
souvent activé par défaut, et par compte plutôt que par email.

### Test de non-régression

Cliquer sur un lien de réinitialisation et vérifier que l'URL atteinte
contient bien `#access_token=…`. Si elle passe par un domaine tiers, le suivi
est réactivé.

## RÈGLE — un « Success » du SQL Editor ne prouve PAS qu'une migration est appliquée

**Seule une vérification séparée, lancée après coup, prouve qu'une migration a
pris. Le message de succès de l'éditeur ne prouve rien.**

### Ce qui a rendu cette règle nécessaire (2026-08-29)

`20260829_roles_02_trigger_role_par_defaut.sql` a été appliquée en production.
Le SQL Editor a affiché **« Success »**. La vérification en 6 contrôles,
lancée juste après, a trouvé :

- trigger `trg_auth_users_role_par_defaut` **absent**
- fonction `attribuer_role_par_defaut()` **absente**
- contre-épreuve **NON CONFORME** — le rôle n'était pas attribué

La migration a été réappliquée, et la seconde fois a été la bonne (6/6 OK,
contre-épreuve CONFORME).

Sans cette vérification, du code applicatif supposant que tout compte possède
un rôle aurait été mergé sur une base où le trigger n'existait pas. La panne
serait apparue en production, sur des comptes créés après le merge, sans
rapport apparent avec la migration.

### Ce que ça implique concrètement

La séquence n'est pas « appliquer, lire le message vert, passer à la suite ».
Elle est :

1. **Appliquer** la migration.
2. **Vérifier** par une requête séparée que les objets attendus existent, avec
   les bons privilèges — sans jamais se fier au retour de l'éditeur.
3. **Contre-éprouver** : provoquer le comportement attendu et constater qu'il
   se produit (et qu'il ne se produit PAS quand la migration est absente).

Les étapes 2 et 3 sont distinctes exprès. La vérification lit un état, la
contre-épreuve exerce un comportement — une migration peut créer tous les
objets et ne pas produire l'effet voulu. C'est la contre-épreuve qui a rendu
l'échec lisible ici, en une ligne : `NON CONFORME`.

L'auto-vérification embarquée dans la migration (le bloc `DO` qui lève une
exception) ne remplace pas ces deux étapes : si la migration n'a pas été
exécutée du tout, son auto-vérification ne l'a pas été non plus.

## RÈGLE — jamais de `$$` nu dans du SQL collé dans le SQL Editor

**Toujours un délimiteur nommé : `$verif$`, `$fn$`, `$trg$`. Jamais `$$`.**

### Pourquoi

Constaté le 2026-08-29 : le SQL Editor de Supabase **injecte parfois du texte
dans le script collé** — en l'occurrence un `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` inséré au milieu d'un bloc `DO $$ ... $$`.

Avec un délimiteur nu, l'insertion **casse la chaîne de dollar-quoting** : le
`$$` d'ouverture se referme au mauvais endroit, et le reste du script est
réinterprété comme du SQL ordinaire. Selon l'endroit de la coupure, le script
peut échouer bruyamment… ou n'exécuter qu'une partie de lui-même en signalant
un succès. C'est le mécanisme le plus plausible derrière le « Success » sans
effet décrit à la section précédente.

Un délimiteur nommé rend l'accident beaucoup moins probable (`$verif$` ne
risque pas de coïncider avec un fragment injecté) et, s'il survient quand
même, l'erreur est franche au lieu d'être silencieuse.

```sql
-- FRAGILE
DO $$ BEGIN ... END $$;

-- ROBUSTE
DO $verif$ BEGIN ... END $verif$;
```

Vaut pour les blocs `DO`, les corps de fonction (`AS $fn$ ... $fn$`) et toute
chaîne dollar-quotée.

### Dette existante

**10 migrations du dépôt utilisent encore `DO $$` nu**, dont
`20260827_roles_01_user_roles.sql` et
`20260829_roles_02_trigger_role_par_defaut.sql`.

Elles ne sont **pas** réécrites rétroactivement : leur contenu a été appliqué
en production et l'empreinte MD5 de ces deux fichiers a servi de contrôle
d'intégrité avant application. Les modifier ferait diverger le fichier de ce
qui a réellement été exécuté, et coûterait la traçabilité qu'on vient de
gagner.

Le risque résiduel est le rejeu : ces migrations sont idempotentes et donc
rejouables, et un rejeu passerait par le SQL Editor. À durcir avant tout
rejeu, ou lors d'une reprise de ces fichiers pour une autre raison.

## RÈGLE — migration en production AVANT le merge sur `main`

**Toute migration dont dépend du code applicatif doit être appliquée en
production AVANT que le code qui l'utilise soit mergé sur `main`.**

`main` déclenche un déploiement production automatique (Vercel). Les
migrations, elles, ne s'appliquent jamais toutes seules : ni la CI ni le
déploiement ne les exécutent. Merger du code qui référence une colonne, une
table ou une fonction absente de la base de production le met **en ligne
immédiatement, cassé**.

Ordre correct, sans exception :

1. Appliquer la migration en **production** (SQL Editor), et vérifier par
   requête qu'elle a bien pris.
2. Appliquer la migration en **staging**, vérifier via le harnais.
3. Merger le code sur `main`.

Ordre inverse = panne en production entre le merge et l'application de la
migration.

### Ce qui a rendu cette règle nécessaire (2026-08-26)

Le lot 7 (`20260819_structure_token_expiration.sql`) a été appliqué sur
staging, vérifié par le harnais, puis mergé. Le merge a déployé en
production `api/_lib/structureAuth.ts`, qui sélectionne `expires_at` — une
colonne alors absente de la base de production. PostgREST a renvoyé une
erreur, `validateStructureToken()` a renvoyé `null`, et **le portail
structure a répondu « Accès non autorisé » à tous les EHPAD**, jusqu'à
l'ajout manuel de la colonne.

Toutes les vérifications étaient au vert, harnais compris : elles portaient
sur staging, où la migration était appliquée. Aucune ne pouvait détecter
l'écart avec la production.

### Comment vérifier avant de merger

Requête à lancer dans le SQL Editor de production pour contrôler la présence
des objets attendus (à étendre à chaque nouvelle migration) :

```sql
SELECT 'claude_rate_limit (table)' AS objet,
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='claude_rate_limit') AS present
UNION ALL SELECT 'structures.expires_at (colonne)',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='structures' AND column_name='expires_at')
UNION ALL SELECT 'user_roles (table)',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='user_roles')
UNION ALL SELECT 'app_role_courant() (fonction)',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='app_role_courant')
UNION ALL SELECT 'trg_participants_consentement_rgpd_creation (trigger)',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid='public.participants'::regclass
                 AND tgname='trg_participants_consentement_rgpd_creation' AND NOT tgisinternal);
```

⚠️ Exception à l'ordre ci-dessus pour `20260913_rgpd_consentement_creation.sql` :
elle s'applique **après** le déploiement du code, voir la section « RÈGLE —
consentement RGPD obligatoire à la création » plus bas.

⚠️ Même exception pour `20260914_retrait_visibilite_progression.sql` (PR #46) :
elle retire une clé que le nouveau code ne lit plus. Appliquée en production
après le merge et le déploiement, vérifiée (voir le point de reprise en tête
de fichier). Une exception se justifie migration par migration, jamais par
défaut : `20260914_apley_scratch_test_bilans.sql` (PR #50) suit l'ordre
normal, parce que le code écrit la nouvelle colonne.

⚠️ Cette requête ne contrôle que la **présence** des objets, pas leurs
privilèges. Pour `user_roles`, la présence ne suffit pas : voir la
vérification complète à 9 contrôles et la contre-épreuve, qui sont dans
l'auto-vérification de `20260827_roles_01_user_roles.sql` — elles vérifient
l'ACL exacte, pas seulement que la table existe.

Tant qu'aucun garde-fou automatique n'existe (rien dans la CI ne compare le
schéma de production aux migrations du dépôt), cette vérification est
manuelle et fait partie de la revue de toute PR touchant `supabase/migrations/`.

Et elle se fait **après** l'application, jamais à la place : voir « un
« Success » du SQL Editor ne prouve PAS qu'une migration est appliquée »
ci-dessus. Une migration peut afficher un succès sans avoir rien créé.

## RÈGLE — consentement RGPD obligatoire à la création d'un bénéficiaire

**Aucune fiche ne se crée sans `rgpd.consentementObtenu = true`, quel que soit
le chemin. Une fiche existante sans consentement reste modifiable.**

### Ce qui a rendu cette règle nécessaire (2026-09-13)

7 fiches de production sans consentement, toutes avec un objet `rgpd` complet
à `false`, `methodeConsentement: "oral_note"` et `consentementDate` égale au
jour de création : l'état initial du formulaire complet, enregistré sans que
rien ne soit coché. Le formulaire affichait un avertissement et ne bloquait
rien. Le formulaire mobile et l'import Excel n'écrivaient même pas `rgpd`.

### Où la règle est appliquée

| Chemin | Blocage |
|---|---|
| Formulaire complet (création) | `submit()` renvoie à l'étape 5 avec un message |
| Formulaire mobile | même règle, même module |
| Import Excel | colonne R « Consentement RGPD » : toute ligne sans « Oui » est refusée et listée |
| Base de données | trigger `BEFORE INSERT` (`20260913_rgpd_consentement_creation.sql`) |

Règles partagées : `src/lib/consentementRgpd.ts` (testé).

**Pas de contrainte `CHECK … NOT VALID`** : `NOT VALID` n'épargne que la
vérification initiale ; la contrainte est ensuite contrôlée à chaque UPDATE,
ce qui aurait bloqué toute modification des fiches sans consentement
(géocodage et archivage compris).

### Ordre d'application : APRÈS le déploiement du code

Inverse de la règle « migration en production AVANT le merge », parce que la
dépendance est inversée : le nouveau code marche avec ou sans trigger, mais le
trigger appliqué sous l'ancien code rejetterait toutes les créations mobiles et
Excel (`rgpd = null`) en production.

1. Merger, attendre la fin du déploiement de production.
2. Appliquer en production, puis les deux requêtes ci-dessous.
3. Appliquer sur staging, relancer le harnais.

### Vérification (requête séparée, lecture seule)

```sql
SELECT
  (SELECT tgtype FROM pg_trigger
    WHERE tgrelid = 'public.participants'::regclass
      AND tgname = 'trg_participants_consentement_rgpd_creation'
      AND NOT tgisinternal) AS tgtype_attendu_7,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'public' AND p.proname = 'exiger_consentement_rgpd_creation'
      AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner) AS roles_execute_attendu_0;
```

Attendu : `7` (BEFORE INSERT FOR EACH ROW, ni UPDATE ni DELETE) et `0`.

### Contre-épreuve (n'écrit rien)

Le bloc se termine par une exception **volontaire** qui annule tout. Le
résultat attendu est donc une erreur dont le message commence par
`CONFORME`. Tout message `NON CONFORME` est un échec.

```sql
DO $contre$
DECLARE v_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.participants (nom, prenom) VALUES ('ContreEpreuve', 'SansRgpd');
    RAISE EXCEPTION 'NON CONFORME (1/4) : creation avec rgpd = null acceptee';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd)
    VALUES ('ContreEpreuve', 'RgpdFalse', '{"consentementObtenu": false}'::jsonb);
    RAISE EXCEPTION 'NON CONFORME (2/4) : creation avec consentementObtenu = false acceptee';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd)
    VALUES ('ContreEpreuve', 'AvecRgpd', '{"consentementObtenu": true}'::jsonb)
    RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'NON CONFORME (3/4) : creation avec consentement refusee';
  END;

  BEGIN
    UPDATE public.participants SET rgpd = NULL WHERE id = v_id;
    UPDATE public.participants SET telephone = '0000000000' WHERE id = v_id;
    INSERT INTO public.participants (id, nom, prenom, rgpd)
    VALUES (v_id, 'ContreEpreuve', 'Upsert', NULL)
    ON CONFLICT (id) DO UPDATE SET prenom = EXCLUDED.prenom;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'NON CONFORME (4/4) : modification d''une fiche sans consentement refusee';
  END;

  RAISE EXCEPTION 'CONFORME (4/4) — exception volontaire : rien n''a ete ecrit';
END
$contre$;
```

Sur staging, `staging-query.ts` ouvre une transaction **en lecture seule** :
les INSERT de la contre-épreuve y échoueraient pour une autre raison, et le
message ne serait jamais `CONFORME`. Il faut une transaction en écriture,
annulée à la fin (`BEGIN` … `ROLLBACK`).

### État au 2026-09-14

- Code en production (PR #44, `9f781b4`).
- Migration appliquée et vérifiée en **production** puis sur **staging**
  (résultats dans le point de reprise en tête de fichier).
- Les `consentementDate` trompeuses des 7 fiches sont effacées ; leur
  consentement reste à régulariser à la main.
- **Non prouvé** : l'e2e 02 (blocage de création) et le harnais praticien
  avec trigger actif — voir le point de reprise.

## CHANTIER — fusion progressive mobile / desktop

### Décision (2026-09-13)

L'espace pro existait en deux applications : l'interface desktop (20 écrans
routés) et `AppMobile`, affichée sous 768 px (`useDevice`). Diagnostic
chiffré du 2026-09-13 :

- 9 écrans en double, 11 desktop seulement ;
- 3 067 lignes propres au mobile, dont environ 90 % réécrivent un écran
  existant et 1 016 lignes de code mort ;
- une correction transversale devait être faite deux fois, et c'est ce qui
  avait laissé entrer un SIRET à 15 chiffres.

Option retenue : **fusionner écran par écran**, plutôt que combler les
manques un par un ou tout unifier d'un coup.

### RÈGLE — la bascule en paysage est un usage voulu

Le praticien tourne **délibérément** son téléphone pour atteindre l'interface
desktop : c'est son seul accès aux 11 écrans sans version mobile. **Ne pas la
bloquer, ne pas déplacer le seuil de 768 px.** Le seul défaut à traiter était
la perte de la saisie en cours. Cette bascule deviendra inutile écran par
écran, à mesure de la fusion.

### Mécanisme en place

- **Routes fusionnées :** `src/lib/routesMobile.ts` → `estRouteInterfaceUnique`
  liste les routes servies par l'interface unique même sous 768 px (testé).
- **Choix de l'interface :** `EspacePro` dans `App.tsx`. Sur une route
  fusionnée, mobile et desktop rendent le même arbre React : la rotation n'y
  démonte rien.
- **Cadre commun :** la barre latérale se replie en barre du bas
  (`BarreNavigationMobile`) sous 768 px, en CSS seulement.
- **`AppMobile` suit l'URL**, et ses URL sont celles des écrans desktop
  équivalents. Un écran desktop seul affiche « Écran disponible en mode
  paysage ».
- **Saisies des écrans encore en double :** conservées en `sessionStorage`
  (`src/lib/etatSession.ts`), effacées à la déconnexion. Les brouillons de
  bilan et de bénéficiaire sont écrits au démontage.

### Avancement

| État | Écrans |
|---|---|
| Fusionné | Fiche bénéficiaire (`/participant/:id`) — 2026-09-14 |
| Encore en double (8) | Tableau de bord ↔ Accueil + Bénéficiaires, nouveau bénéficiaire, modifier la fiche, nouveau bilan, détail bilan, assistant, tournée, paramètres |
| Desktop seulement (11) | Agenda, carte, zones, stats, bibliothèque, programme, nouveau contrat, rapport d'évolution, modifier un bilan, détail structure, administration |

### Fusionner l'écran suivant

1. Rendre la page desktop utilisable sous 768 px, seulement ce dont cet
   écran a besoin.
2. Reprendre les fonctions que seule la version mobile offrait.
3. Ajouter la route dans `estRouteInterfaceUnique`, avec un test dans
   `routesMobile.test.ts`.
4. Supprimer l'écran mobile, son cas dans `AppMobile` et la persistance en
   session qui lui était propre : sur une route fusionnée, elle ne sert plus.
5. Vérifier la page à 390 px **à l'écran**. Pour la fiche, ça n'a pas été
   fait (l'onglet Contrats notamment).

## Échecs connus et acceptés du harnais `tests/security/rls.spec.ts`

Le job `audit` de `.github/workflows/security.yml` fait échouer la CI sur tout
skip ou tout échec du harnais — volontairement, pour ne jamais laisser un vert
silencieux masquer un test qui ne tourne pas vraiment (voir le commentaire en
tête de ce workflow). Cette liste est l'exception explicite à cette règle :
les échecs ci-dessous sont connus, expliqués, et acceptés jusqu'à ce que leur
cause soit traitée. **Toute CI rouge sur ce harnais doit d'abord être comparée
à cette liste avant d'être traitée comme un blocage** — si le test en échec
n'y figure pas, c'est une vraie régression, pas un faux positif connu.

Tenir cette liste à jour à chaque lot de l'étape 1 : si un lot corrige l'un de
ces points, le retirer d'ici dans la même PR (comme le lot 4 l'a fait pour
`[F-06]`, retiré de cette liste le 2026-08-26).

### Cette liste est vide depuis le 2026-08-27

**Aucun échec ni skip n'est accepté aujourd'hui.** Toute CI rouge sur ce
harnais est donc une vraie régression, à traiter comme telle — il n'y a plus
de faux positif connu derrière lequel s'abriter.

Comment on y est arrivé, en trois temps le 2026-08-27 :

1. **Le contrôle des skips n'avait jamais pu s'exécuter.** Il était placé
   après celui des échecs, qui sort en `exit(1)` — et un test échouait en
   permanence. L'étape promettait « un skip est un échec, jamais un vert
   silencieux » et ne pouvait pas tenir cette promesse. La logique vit
   désormais dans `scripts/verifier-resultat-harnais.mjs`, qui ne sort plus
   au milieu : il collecte tout, affiche tout, décide à la fin.

2. **Ce qu'il a révélé dans la minute : sept tests ne s'exécutaient pas.**
   Tout le bloc « Findings structurels » (F-05, F-07, F-08, F-09, F-10, plus
   les deux contrôles `[F-01]` du lot 8). Son `beforeAll` ouvrait une
   connexion Postgres directe, qui échouait en `ENETUNREACH` sur les runners
   GitHub — l'hôte n'était joignable qu'en IPv6. Vitest rangeait alors ses
   tests parmi les non exécutés, sans que rien ne le signale. Ces cinq
   findings de sécurité étaient **affirmés, pas prouvés**.

3. **Basculer `STAGING_DATABASE_URL` sur le pooler (IPv4) les a débloqués**,
   et a du même coup rendu possible la migration du test de couverture vers
   la connexion directe (`information_schema` n'est pas exposé par
   PostgREST). Le harnais est passé de 44 tests dont 7 fantômes et 1 échec
   permanent, à 45 tests réellement exécutés.

Tenir cette liste à jour : si un échec devient temporairement acceptable, il
s'inscrit ici avec sa cause et ce qui le débloquerait — et il en repart dans
la PR qui le corrige (comme le lot 4 l'a fait pour `[F-06]` le 2026-08-26).

## RÈGLE — une suite de tests qui écrit dans une base partagée nettoie AVANT, pas après

**Toute suite de tests qui écrit dans une base partagée doit remettre l'état
de départ avant de commencer, et ne jamais compter sur son propre nettoyage
de fin.**

Ce n'est pas un correctif ponctuel, c'est une règle de conception. Un
nettoyage de fin ne s'exécute pas quand le test échoue — or c'est
exactement le moment où il laisse le plus de traces. La suite se retrouve
alors à échouer sur l'état laissé par son propre échec précédent, et plus
aucun run ne peut s'en sortir seul.

### Trois occurrences le même jour (2026-08-27)

Les trois ont le même squelette : le test écrit, échoue, et l'écriture
survit.

1. **`07-seance-coche-exercice`** enregistre la séance du jour du patient de
   démo. Un index unique
   (`seances_patient_no_double_validation_idx`) interdit de la revalider :
   le run suivant recevait un 409 parfaitement légitime. Le test ne pouvait
   passer qu'**une fois par jour et par environnement**. Il est passé au
   vert puis retombé au rouge sans qu'une ligne de code ne change.

2. **`03-creation-bilan`** parcourt un formulaire qui enregistre un
   brouillon au fil des étapes (localStorage **et** Supabase, pour la
   reprise multi-appareils). Un échec en cours de route laisse le brouillon ;
   au run suivant, le modal « reprendre le brouillon ? » bloque les clics, le
   test échoue au même endroit et réenregistre un brouillon. **Panne
   auto-entretenue** : trois runs consécutifs, et la purge des bilans
   accumulés n'y changeait rien — ce qui a d'abord fait suspecter, à tort,
   l'accumulation.

3. **Accumulation silencieuse.** `03` ajoute un bilan trimestriel à chaque
   passage réussi (13 bilans, `trimestre` jusqu'à 13), `02` ajoute un
   participant à chaque passage. Aucun des deux ne fait échouer quoi que ce
   soit tout de suite — l'état du jeu de démo dérive simplement, run après
   run, jusqu'à ce qu'un test s'y casse pour une raison qui n'a plus l'air
   d'avoir de rapport.

### Ce qu'on en fait

`scripts/staging-reset-etat-e2e.ts`, appelé par le job `e2e` **avant**
Playwright, remet le jeu de démo dans son état de départ. Toute écriture
nouvelle introduite par un test doit y être ajoutée dans la même PR.

Le corollaire vaut aussi pour les tests eux-mêmes : un test qui a besoin
d'une donnée doit vérifier qu'elle est là (`expect(...).toBeGreaterThan(0)`)
plutôt que de boucler sur une liste éventuellement vide — sinon il passe au
vert sans rien vérifier, ce qui est pire qu'un échec.

## CHANTIER — le secret du cron est recopié en clair à chaque exécution

**Identifié le 2026-08-31, pendant la rotation de `x-cron-secret`. Non traité,
volontairement : la rotation devait aboutir d'abord.**

### Le constat

Le secret est écrit en clair dans la commande du job pg_cron :

```sql
SELECT net.http_post(
  url     := 'https://app.horizon-suivi.fr/api/cron/rappels',
  headers := jsonb_build_object('x-cron-secret', '<le secret, en clair>'),
  body    := '{}'::jsonb
);
```

`cron.job_run_details` conserve la colonne `command` de **chaque exécution**.
Le job tourne toutes les heures : le secret est donc recopié 24 fois par jour
dans un historique que rien ne purge. Le 2026-08-31, la purge qui a suivi la
rotation a supprimé **1861 lignes**.

### Pourquoi la purge n'est pas le correctif

Elle nettoie le passé, elle n'empêche rien. Tant que le secret vit dans
`cron.job.command`, l'historique se reconstitue à la vitesse d'une ligne par
heure. **C'est une opération à refaire, pas une correction** — et une
opération qu'on oubliera, parce que rien ne la déclenche.

### La piste

**Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`) stocke
le secret chiffré et le job ne référence plus qu'un identifiant :

```sql
headers := jsonb_build_object(
  'x-cron-secret',
  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
)
```

La commande devient alors sans valeur pour qui la lit, et l'historique aussi.

### Ce qui reste à trancher avant de le faire

- **Le `command` enregistré contient-il la requête littérale ou son résultat ?**
  À vérifier sur une exécution réelle : si pg_cron journalise la commande
  telle qu'écrite, le problème disparaît ; s'il journalise autre chose, il
  faut le constater avant de conclure. Ne pas raisonner sans la donnée.
- **Quel rôle lit `vault.decrypted_secrets`** au moment où le job s'exécute,
  et cette lecture est-elle possible depuis le contexte de pg_cron.
- **La rotation devient une mise à jour du Vault**, plus une reprogrammation
  du job : la procédure de rotation documentée est à réécrire en conséquence.

### Portée

Le même schéma vaut pour le job de staging. Et pour tout futur job pg_cron
qui porterait un secret dans ses en-têtes.

## INVENTAIRE — ce qui n'a jamais été extrait d'`audit-securite-global`

> **Mise à jour du 2026-09-07.** Les points 4, 5 et 6 ont bougé (PR #38), et
> les points 1 et 2 ont été **corrigés dans ce document, pas dans le code** :
> ils annonçaient encore « branche `securite-idor-patient-f13-f14`, non
> mergée » alors que la PR #31 était mergée depuis le 2026-09-04 (`aa61458`,
> ancêtre de `main`). Un lecteur en concluait que les deux IDOR étaient
> ouverts en production. Ils ne l'étaient pas.
>
> Leçon à retenir sur ce document plutôt que sur ces deux lignes : **un
> inventaire daté ment dès que le code avance sans lui.** Les états y sont
> désormais accompagnés du SHA qui les prouve, pour qu'une relecture puisse
> les revérifier sans faire confiance à la phrase.
>
> Deux remarques de portée, à lire avant de se fier au tableau :
>
> - **Cet inventaire ne couvre que `api/`, `src/` et `vercel.json`.** Les
>   Edge Functions Supabase n'y ont jamais figuré. `analyser-seance` était
>   pourtant appelable sans vérification d'appelant et avec CORS à `*`
>   jusqu'au 2026-09-07 (PR #37), et `interpreter-bilan`, jamais appelée par
>   aucun code, transmettait un champ `prompt` brut à Anthropic — elle a été
>   supprimée. Un inventaire dressé « fichier par fichier » qui omet un
>   répertoire entier donne une fausse assurance : `supabase/functions/` est
>   à traiter à part.
> - **Un commentaire de migration affirmait un contrôle inexistant.**
>   `20260817_securite_08_rate_limit_claude.sql` écrivait que `api/claude.ts`
>   « a un plafond de taille de prompt », alors que le point 4 ci-dessous le
>   classait `Ouvert` au même moment. Corrigé dans le fichier de migration
>   (commentaire seul, DDL inchangé). À retenir pour la relecture des autres
>   migrations : leurs préambules citent des documents absents de `main` et
>   des contrôles supposés acquis.

**Dressé le 2026-09-03, fichier par fichier contre `origin/main`.** La liste
qui précédait n'en comptait que 3 : elle avait été écrite en préparant le
lot 6, à partir d'un seul commit (`d6be50f`), sans inventaire complet de la
branche. Sept éléments manquaient, dont deux IDOR en production.

`audit-securite-global` compte **21 commits jamais mergés**. Elle est
désormais poussée sur `origin` (2026-09-03) : `docs/ETAT_AUDIT.md` interdit
le **merge**, pas la sauvegarde, et elle portait les seules versions connues
de plusieurs correctifs sur un unique disque.

### La liste, et l'état réel de chaque élément

| # | Élément | Où | État au 2026-09-03 |
|---|---|---|---|
| 1 | **[F-13] IDOR `api/patient/retour-seance.ts`** — `seanceId` du body inséré sans contrôle d'appartenance | `api/` | **Corrigé et mergé**, PR #31 (merge `aa61458`, 2026-09-04). Contrôle vérifié sur `main` le 2026-09-07 : `retour-seance.ts:82-83`, `.eq('id', seanceId).eq('participant_id', participantId)`, 404 et non 403 |
| 2 | **[F-14] IDOR `api/patient/seance.ts`** — `exercices[].id` inséré sans contrôle | `api/` | **Corrigé et mergé**, même PR #31 — avec les 2 contrôles voisins qui manquaient aussi (`programmeId`, `seanceId`). Vérifiés sur `main` le 2026-09-07 : `seance.ts:73-74` (programme → participant), `:87-88` (séance → programme), `:109-111` (exercices → séance, en un seul aller-retour). `git log aa61458..main` sur ces deux fichiers est vide : rien ne les a touchés depuis |
| 3 | **[F-02] `code_acces` tirés avec `Math.random()`** | `src/utils/codeAcces.ts` | **Ouvert.** Détail plus bas, section « chantiers annexes » |
| 4 | **Plafond de taille de prompt** (`PROMPT_MAX_LENGTH`, `api/_lib/guard.ts`) | `api/claude.ts` | **Corrigé** le 2026-09-07, PR #38. `guard.ts` existe désormais. Seuil 60 000 caractères, posé sur une mesure (catalogue d'exercices = 21 313 car. pour 64 exercices ; plus gros prompt ≈ 24 000) et non sur une estimation. Verrouillé par `src/utils/genererProgrammeIA.test.ts`, qui échoue si le catalogue grossit au point de menacer la génération de programme |
| 5 | **Garde-fou anti prompt-injection** — message système instruisant le modèle à traiter le texte utilisateur comme donnée, jamais comme instruction | `api/claude.ts` | **Corrigé** le 2026-09-07, PR #38, sous la forme décrite : `SYSTEME_CADRAGE` dans `api/_lib/guard.ts`. **Portée à connaître** : le prompt arrive assemblé, la consigne de tâche et le texte dicté par un tiers y sont indiscernables. Un détecteur par motif est donc impossible ici — il fouillerait les prompts de l'application, qui sont faits d'instructions. Le message système distingue la consigne (à suivre) des données citées (à analyser) ; c'est le maximum exprimable sans délimiteur, et c'est plus faible que le bloc à nonce de `analyser-seance`. Le vrai renforcement serait de déplacer l'assemblage du prompt côté serveur, ou d'appliquer le détecteur au niveau des champs dans les 7 constructeurs — non fait |
| 6 | **Sanitisation des messages d'erreur** — `String(err)` → `'Erreur serveur'` + `console.error` | `api/claude.ts` (2 `catch`), `api/patient/seance.ts`, `api/patient/retour-seance.ts` | **Partiellement corrigé.** `api/claude.ts` fait le 2026-09-07, PR #38 : les 2 `catch` plus le corps d'erreur d'Anthropic, qui repartait aussi au navigateur et n'était pas compté dans ce point. **Reste ouvert** sur `api/patient/seance.ts` et `api/patient/retour-seance.ts` |
| 7 | **En-têtes de sécurité HTTP** — HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CSP en `Report-Only`, plus `Cache-Control: no-store` sur `/api/*` | `vercel.json` | **Ouvert.** Aucun en-tête sur `main` |
| 8 | **Durcissement Sentry client** — `delete event.user` et `event.request.cookies` dans `beforeSend` | `src/lib/sentry.ts` | **Ouvert.** Défense en profondeur : rien n'appelle `setUser()` et `sendDefaultPii` est déjà à `false` |
| 9 | **Validation Zod des entrées API** (12 routes) | `api/` | **Jamais fait, et pas arbitré.** Bloqué par l'absence d'environnement de test au moment de l'audit (`ETAT_AUDIT.md`). Les 12 routes ont une validation manuelle par champ ; migrer vers Zod changerait la forme des réponses d'erreur consommées par `src/lib/patientApi.ts` |
| 10 | **7 documents d'audit** — `RAPPORT_SECURITE.md`, `CARTOGRAPHIE_SECURITE.md`, `AUDIT_ROUTES_API.md`, `PACK_CODE_SECURITE_REFERENCE.md`, `MES_ACTIONS.md`, `ETAT_AUDIT.md`, `AUDIT_DEPENDANCE_XLSX.md` | `docs/` | **Absents de `main`.** Plusieurs migrations mergées les citent pourtant comme référence : ces renvois pointent aujourd'hui vers des fichiers introuvables pour qui ne connaît pas la branche |

### Inventaire des surfaces déployées (dressé le 2026-09-07)

Le tableau ci-dessus liste des **correctifs**, pas des **surfaces**. C'est ce
qui a permis à deux angles morts de subsister : `supabase/functions/` n'y a
jamais figuré, et deux routes API non plus. Cette section liste tout ce qui
est joignable depuis l'extérieur, pour que l'omission suivante soit visible.

Établi par `git ls-tree -r main --name-only -- api/` (hors `_lib/` et
`*.test.ts`), `supabase/functions/`, et les `rewrites` de `vercel.json`.

| Surface | Contrôle d'accès | Couverte par un audit précédent ? |
|---|---|---|
| `api/claude.ts` | JWT praticien + rate limit 100/h + plafond 60 000 | Oui — points 4, 5, 6 |
| `api/cron/rappels.ts` | `x-cron-secret` vs `CRON_SECRET`, comparaison à temps constant | Oui — PR #23, #26 |
| `api/organisation.ts` | `exigerAdmin` (`_lib/adminAuth.ts`) | Oui — PR #25 |
| `api/patient/activite.ts` | token patient + 403 par test/exercice non activé | Partiellement |
| `api/patient/me.ts` | token patient | Oui |
| `api/patient/push-subscribe.ts` | token patient | Non |
| `api/patient/retour-seance.ts` | token patient + appartenance (F-13) | Oui — points 1, 6 |
| `api/patient/seance.ts` | token patient + 3 contrôles d'appartenance (F-14) | Oui — points 2, 6 |
| `api/patient/session.ts` | émet le token ; rate limit par IP (`patient_login_attempts`) | Oui |
| **`api/planning/ics.ts`** | **token en query string**, validé contre `praticiens.token_planning_ics` | **NON — jamais auditée** |
| **`api/seances/supprimer-planifiees.ts`** | JWT praticien + 403 sur contrats non possédés | **NON — jamais auditée** |
| `api/structure/data.ts` | `validateStructureToken` | Oui — PR #12, #18, #20 |
| `supabase/functions/analyser-seance` | CORS fermé + JWT + plafonds + nonce | Depuis PR #37 seulement |
| `vercel.json` rewrites | `/api/(.*)` et fallback SPA — aucune route cachée | — |

Aucun webhook. Un seul cron. Une seule Edge Function depuis la suppression
d'`interpreter-bilan` (#37).

#### `api/planning/ics.ts` — ce qu'il faut savoir

Endpoint **public à URL-capacité** : le token voyage en query string parce
qu'aucune application calendrier ne sait ajouter d'en-tête à une
souscription webcal (contrainte documentée dans le fichier, l.9-11). Il est
validé côté serveur via `service_role`, qui contourne RLS.

- **L'entropie est correcte** : `crypto.getRandomValues` (`SettingsPage.tsx:565`),
  pas `Math.random()` — contrairement aux codes d'accès patient (point 3).
- **Aucun rate limit** sur cette route, contrairement à `/api/claude` et à la
  connexion patient. C'est la seule route authentifiée dans ce cas.
- Le token apparaît dans les journaux Vercel, l'historique du navigateur et
  la configuration de l'application calendrier du praticien — inhérent à
  webcal, mais il donne accès à **tout le planning** d'un praticien, noms des
  bénéficiaires compris.
- Réponses volontairement peu bavardes (404 générique) : pas de fuite sur
  l'existence d'un mécanisme d'authentification.

#### `api/seances/supprimer-planifiees.ts` — ce qu'il faut savoir

**Route destructive**, jamais listée dans un audit. Le contrôle d'accès y est
correct : JWT praticien vérifié (l.19-30), puis appartenance de **tous** les
contrats vérifiée avant toute suppression (403 l.50 si un seul n'appartient
pas à l'appelant). La suppression est en outre bornée à `statut = 'planifiee'`
et `date >= dateMin` (l.56-58) — elle ne touche pas les séances passées ni
réalisées.

Le point à connaître est ailleurs : **la journalisation est conditionnelle.**

`logAuditEvent` n'est appelé que si `raison === 'fin_de_contrat'` **et**
`nbSupprimees > 0` (l.65-75). Or sur les trois points d'appel côté client,
un seul envoie cette raison :

| Appelant | `raison` envoyée | Trace dans `audit_logs` |
|---|---|---|
| `ContratsTab.tsx:212` | `'fin_de_contrat'` | oui |
| `ContratsTab.tsx:262` | aucune | **non** |
| `ModalPlanificateur.tsx:32` | aucune | **non** |

Deux des trois chemins de suppression de masse ne laissent donc aucune trace
applicative. Ce n'est pas une faille d'accès — l'appelant est authentifié et
propriétaire — mais cela retire toute possibilité de reconstituer après coup
ce qui a été supprimé, par qui et quand. À arbitrer : soit rendre `raison`
obligatoire, soit journaliser inconditionnellement.

### Deux pièges à connaître avant toute extraction

**Un cherry-pick brut régresserait.** La branche a été figée le 2026-08-19 ;
`main` a avancé depuis. Trois fichiers y sont désormais **en retard** :

- `api/structure/data.ts` et `api/_lib/structureAuth.ts` — dépassés par les
  PR #12, #18 et #20 ;
- `api/claude.ts` — la version de la branche est amputée du log Sentry du
  rate limit, ajouté par la PR #11.

L'extraction se fait à la main, correctif par correctif, en repartant de
`main`.

**Le schéma a bougé.** Quinze jours suffisent : entre le gel de la branche
(2026-08-19) et le 2026-09-03, `user_roles` a été posée (2026-08-29), la
parité des `GRANT` a été reprise deux fois (`20260821`, `20260822`),
`structures.expires_at` est apparue, et `tm6_variantes` a reçu un
propriétaire par ligne. Les hypothèses de base d'un correctif se revérifient
donc sur la base réelle avant réécriture, quel que soit son âge apparent —
c'est ce qui a été fait pour F-13/F-14, dont les quatre chaînes de clés
étrangères ont été relues sur staging avant d'écrire une ligne.

Le mot « étape 3 » ci-dessous renvoie à un message de commit, pas à un plan :
voir la première section de ce fichier.

### Compatibilité avec `user_roles` — vérifiée, pas supposée

`git grep -i "user_roles\|app_role_courant"` sur `audit-securite-global`
renvoie **zéro ligne** : la branche ignore totalement le modèle de rôles
posé par l'étape 3. Ce qui reste à extraire est du code applicatif (`api/`,
`src/`, `vercel.json`), pas des policies RLS, et rien n'y suppose que « tout
compte authentifié est un praticien ». Aucune incompatibilité — seulement le
retard décrit ci-dessus.

## PREUVE D'EXPLOITATION — quatre IDOR exercés sur staging (2026-09-03)

**Ce ne sont pas des failles déduites d'une lecture de code. Elles ont été
exercées, et les écritures ont eu lieu.**

`scripts/staging-sonde-idor-patient.ts` appelle les handlers de
`POST /api/patient/seance` et `POST /api/patient/retour-seance` en process,
avec le JWT d'un bénéficiaire et l'identifiant d'un autre. Sur le code de
`main` du jour, **les quatre appels frauduleux ont renvoyé `200`** :

| Contrôle absent | Ce qu'il permettait |
|---|---|
| `programmeId` | écrire une séance dans le programme d'un tiers |
| `seanceId` | la rattacher à une séance qui n'est pas de ce programme |
| `exercices[].id` — [F-14] | y joindre l'exercice d'un tiers |
| `seanceId` du retour — [F-13] | rattacher son ressenti (Borg RPE, bien-être — **donnée de santé**) à la séance d'un tiers |

```
AVANT (routes à l'état main)   : 4 sens ROUGE en ÉCHEC (200 au lieu de 404),
                                 2 sens VERT OK
                                 >>> 4 contrôle(s) NON CONFORME(S) <<<
APRÈS (securite-idor-patient-f13-f14) : 6/6 OK
                                 >>> CONFORME <<<
```

Les identifiants ne sont pas à deviner : ils circulent légitimement jusqu'au
navigateur via `GET /api/patient/me`, et `seancePatientId` est renvoyé par
`POST /api/patient/seance`. Ils restent valides indéfiniment.

### Ce que cet épisode apprend, au-delà des quatre correctifs

1. **Une clé étrangère ne prouve jamais une appartenance.** Elle prouve
   qu'une ligne existe. La règle était déjà écrite dans `CHECKLIST_RELEASE.md`
   (section 3) après F-13/F-14 — elle n'a pas empêché les failles de rester
   ouvertes, parce que le correctif, lui, n'était suivi nulle part.
2. **Le sens vert d'une épreuve n'est pas décoratif.** Ces routes se
   déploient **au merge**, sans étape manuelle : un contrôle trop strict
   casse la validation de séance en production dans la minute. Chaque
   contrôle est donc éprouvé dans les deux sens.
3. **Une sonde peut mentir dans le sens rassurant.** Première version : sans
   nettoyage entre chaque appel, un appel qui aboutit — le symptôme même du
   contrôle manquant — laisse une ligne qui fait échouer le suivant sur la
   contrainte d'unicité (`23505`). La sonde comptait ce `409` comme
   « refusé ». Elle nettoie désormais avant, entre chaque appel, et après.

## Code mort de l'ancienne architecture « client anon direct »

`MIGRATION_ANON.md` décrit le passage d'un accès Supabase anon direct
(portail structure) vers les routes serveur `GET /api/structure/*`
(service_role). Plusieurs vestiges de l'ancienne architecture n'ont jamais
été supprimés. Aucun n'a d'appelant — vérifié par `grep` sur `src/`, `api/`,
`scripts/`, `tests/`, `e2e/` :

- `src/hooks/useStructures.ts:verifierTokenStructure()` — validation de token
  côté client, sans auth. Zéro appelant. À noter : elle ne vérifie pas
  `expires_at` (le lot 7 ne l'a pas modifiée, faute d'appelant à protéger) —
  si elle était un jour réutilisée telle quelle, elle contournerait
  l'expiration ajoutée par [F-04]. À supprimer plutôt qu'à corriger.
- `get_praticien_structure(text)` et `structure_token_valide(uuid)` —
  fonctions Postgres, traitées par
  `20260826_revoke_public_execute_functions.sql` (REVOKE + DROP).

## Procédure de purge RGPD sur `audit_logs`

Depuis `20260817_securite_03_audit_logs_immuable.sql`, la table `public.audit_logs`
est protégée par un trigger `BEFORE UPDATE OR DELETE` (`trg_audit_logs_immuable`)
qui lève systématiquement une exception — y compris pour `service_role`, qui
n'est pas soumis à RLS. Objectif : garantir que la seule façon de modifier ou
supprimer une ligne d'audit est une purge délibérée et documentée, jamais une
requête applicative ordinaire ou un bug.

Conséquence directe : une purge de rétention (droit à l'effacement RGPD,
politique de rétention à durée fixe, etc.) ne peut plus se faire par un simple
`DELETE`. Elle doit désactiver le trigger explicitement, purger, puis le
réactiver — en une seule opération documentée (ticket, changelog, ou les deux),
jamais silencieuse.

### Procédure

```sql
ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_immuable;

-- Exemple : purge des logs de plus d'un an.
DELETE FROM public.audit_logs WHERE created_at < now() - interval '1 year';

-- Exemple : purge liée à un droit à l'effacement pour un participant donné.
-- DELETE FROM public.audit_logs WHERE participant_id = '<uuid>';

ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_immuable;
```

À faire systématiquement dans le même changement (migration versionnée ou
script exécuté et archivé) :
- Consigner qui a déclenché la purge, quand, et sur quel périmètre (critère
  de sélection exact du `DELETE`).
- Vérifier après coup que le trigger est bien réactivé
  (`SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_audit_logs_immuable';`
  doit renvoyer `'O'`, pas `'D'`) — l'oubli de réactivation rouvrirait
  silencieusement la faille que ce trigger corrige.
- Ne jamais exécuter la désactivation et la purge comme deux étapes
  manuelles séparées dans le temps : le trigger resterait désactivé entre
  les deux, sans garde-fou.

### Rollback complet du correctif (pas une purge — un revert du trigger lui-même)

```sql
DROP TRIGGER IF EXISTS trg_audit_logs_immuable ON public.audit_logs;
DROP FUNCTION IF EXISTS public.audit_logs_immuable();
```

## Chantiers annexes — outillage et hygiène

Relevés le 2026-08-27 en préparant le lot 8. Aucun n'est bloquant, aucun
n'est traité : listés ici pour ne pas être redécouverts à chaque session.

### Deux scripts écrivent dans un dossier orphelin

`scripts/staging-reset-praticien-a-password.ts:31` définit un `OUT_DIR`
**codé en dur** vers le scratchpad d'une session de travail terminée. Le
script y écrit le mot de passe qu'il vient de générer — donc toute
exécution future dépose la seule copie de ce secret dans un dossier
temporaire qui n'a plus de rapport avec la session en cours, et que
personne ne pense à aller lire.

`scripts/staging-backup.ts` a exactement le même défaut, constaté le
2026-08-27 : la sauvegarde prise avant un reseed est partie dans ce même
dossier d'une session terminée. Moins grave (ce n'est pas un secret, et le
script affiche le chemin), mais une sauvegarde qu'on ne retrouve pas ne
protège de rien.

Correctif attendu pour les deux : passer le chemin de sortie en argument
(`--out <fichier>`), et refuser de tourner si l'argument est absent, plutôt
que de retomber silencieusement sur un chemin mort.

Contexte : c'est ce qui a rendu le harnais inexécutable en local le
2026-08-27. `E2E_PRATICIEN_PASSWORD` dans `.env.test.local` contient une
valeur périmée ; celle qui fonctionne n'existe que dans le shell de
l'opérateur (`$env:E2E_PRATICIEN_PASSWORD`), posée à la main avant chaque
run, exactement comme le décrit `scripts/staging-push-github-secrets.ts`.
Tant que ce fonctionnement reste le bon (décision du 2026-08-27 : ne pas
réinitialiser le mot de passe pour ne pas désynchroniser le secret GitHub
utilisé par la CI), il doit être **documenté** plutôt que redécouvert :
lancer le harnais en local suppose de poser cette variable soi-même.

### Le compte `staging.praticien@example.com` est hors service — remplacé

**Depuis le 2026-09-08, le compte praticien de staging est
`staging.praticien2@example.com`
(`0b38b494-3a9c-45c8-94de-b054d4e6204e`). L'ancien,
`staging.praticien@example.com`, est mort : ne pas y revenir.**

Pourquoi il a été contourné et non réparé : son mot de passe n'était plus
connu (la valeur de `.env.test.local` était périmée, voir ci-dessus),
l'interface Supabase n'offre pas de réinitialisation directe pour ce
compte, et sa **suppression échoue** — `Database error deleting user`. Un
compte qu'on ne peut ni ouvrir, ni réinitialiser, ni supprimer n'a pas de
correctif : il a été remplacé.

Ce que le remplacement a impliqué, et qu'un run futur suppose déjà fait :

- les participants de démo **Camille Martin** et **Julien Bernard** sont
  rattachés au nouveau `praticien_id` ;
- `E2E_PATIENT_CODE` / `E2E_PATIENT_CODE_2` valaient `CAM001` / `JUL002`
  dans `.env.test.local` — des codes qui ne correspondaient à aucune ligne
  en base. Les valeurs justes sont `CAME2E26` / `JUNE2E27`, que les
  variables de dépôt portaient déjà depuis le 2026-06-16 : c'est le fichier
  local qui avait dérivé, pas la CI ;
- la variable de dépôt `E2E_PRATICIEN_EMAIL` a été repointée le 2026-09-08.

**La décision du 2026-08-27 de ne pas réinitialiser le mot de passe est
caduque pour l'ancien compte, mais son motif vaut toujours pour le
nouveau** : le mot de passe de `staging.praticien2@example.com` n'existe
que dans le shell de l'opérateur et dans le secret GitHub
`E2E_PRATICIEN_PASSWORD`. Le poser à la main avant chaque run local reste
la procédure.

**Piège relevé le 2026-09-14, non corrigé** : `scripts/run-harnais-local.mjs`
pose encore par défaut `E2E_PRATICIEN_EMAIL=staging.praticien@example.com`,
c'est-à-dire l'ancien compte mort. Poser le mot de passe ne suffit donc pas en
local : il faut aussi `E2E_PRATICIEN_EMAIL=staging.praticien2@example.com`.
Correctif attendu : changer cette valeur par défaut dans le script.

### Cinq valeurs du harnais sont des *variables* de dépôt, pas des secrets

Piège vérifié le 2026-09-08, après deux synchronisations manquées. Les deux
workflows lisent :

| Valeur | Lue comme |
|---|---|
| `E2E_PRATICIEN_EMAIL` | `vars.` |
| `E2E_PATIENT_CODE`, `E2E_PATIENT_CODE_2` | `vars.` |
| `E2E_STRUCTURE_TOKEN`, `E2E_BASE_URL` | `vars.` |
| `E2E_PRATICIEN_PASSWORD` | `secrets.` |

(`ci.yml:78-86`, `security.yml:94-98`.)

`gh secret set E2E_PRATICIEN_EMAIL ...` **ne change donc rien** : la CI
continue de lire `vars.E2E_PRATICIEN_EMAIL`. Un secret du même nom existe
sans être lu par personne, et `gh secret list` affiche une date de mise à
jour récente qui donne l'illusion de la synchro. C'est ce qui a fait croire
deux fois que la CI était à jour.

`scripts/staging-push-github-secrets.ts` n'aide pas ici : il ne connaît que
`gh secret set` et ne pose aucune des cinq variables. Pour celles-là, la
commande est `gh variable set`. **Vérifier avec `gh variable list`, pas avec
`gh secret list`.**

Trois secrets orphelins subsistent du 2026-09-08 (`E2E_PRATICIEN_EMAIL`,
`E2E_PATIENT_CODE`, `E2E_PATIENT_CODE_2`) : aucun workflow ne les lit. À
supprimer, pour que le prochain lecteur de `gh secret list` ne s'y fie pas.

### `STAGING_DATABASE_URL` est sur le pooler en mode *transaction*, pas *session*

Depuis le 2026-08-27, la chaîne pointe sur
`aws-0-eu-west-3.pooler.supabase.com:**6543**`. Le port 6543 est le pooler en
mode **transaction** ; le mode **session** est sur le **5432**.

Ça fonctionne aujourd'hui, et c'est ce qui a débloqué les sept tests
structurels en CI. Deux conséquences à connaître avant d'écrire un nouveau
test qui passerait par cette connexion :

- **Aucun état de session ne persiste d'une requête à l'autre.** Le
  `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` du `beforeAll` de
  `tests/security/rls.spec.ts` est accepté mais sans effet durable : le
  harnais ne tourne pas réellement en lecture seule, il s'y tient par
  discipline (il ne fait que des `SELECT`). Sans conséquence tant que
  personne n'y ajoute une écriture par mégarde.
- **Les fonctionnalités liées à la session sont indisponibles** : verrous
  consultatifs, `LISTEN`/`NOTIFY`, `SET` persistant, curseurs `WITH HOLD`.
  Un test qui en aurait besoin devra passer par le 5432.

À basculer sur le mode session (5432) au prochain passage dans le dashboard
Supabase — décision de Lorenzo, sans urgence.

### Les `code_acces` sont tirés avec `Math.random()`

`src/utils/codeAcces.ts` tire 8 caractères dans un alphabet de 31 symboles
avec `Math.random()`. L'espace est large — 31⁸ ≈ 8,5 × 10¹¹, soit une
chance sur ~3,5 × 10¹⁰ de tomber sur l'un des 24 codes de production par
tirage aveugle — mais **`Math.random()` n'est pas cryptographique**. C'est
un xorshift128+ dans V8 : qui observe assez de sorties du même contexte
peut reconstituer l'état interne et prédire les suivantes.

Ce que ça veut dire concrètement : un code d'accès **est** un justificatif
d'authentification (il ouvre le dossier de santé du bénéficiaire, en
écriture). Il devrait être tiré comme tel. Le correctif tient en une ligne —
`crypto.getRandomValues()` à la place de `Math.random()`, même alphabet,
même longueur, aucun changement visible.

Nuance sur l'exploitabilité, pour ne pas surestimer : la génération a lieu
dans le navigateur du praticien, au moment où il crée une fiche. Un
attaquant devrait donc observer des codes issus de la même session de
navigation pour prédire les suivants — ce qui suppose déjà un accès à ces
codes. Faiblesse réelle, pas trou béant.

À noter : `scripts/regenerer-codes-acces-structure.ts` utilise déjà
`crypto.randomInt()`. Les codes régénérés sont donc plus solides que ceux
créés par l'application au quotidien — incohérence à résorber en traitant
ce point.

### Le rate limit patient est par IP seulement, et l'IP est déclarative

`api/_lib/patientAuth.ts` : 5 tentatives / 15 min, comptées **par IP**
(`patient_login_attempts`). Ni par code, ni globalement. Deux limites :

1. **Aucun plafond global.** Un attaquant disposant de N adresses obtient
   5N tentatives par quart d'heure. Avec un botnet de 10 000 IP, on atteint
   l'ordre de grandeur d'un succès par an sur les 24 codes actuels — pas un
   risque immédiat, mais une propriété qui se dégrade à mesure que le nombre
   de bénéficiaires augmente, puisque la cible grossit.
2. **L'IP est prise dans `x-forwarded-for`**, premier élément
   (`getClientIp`, ligne 52). Si la plateforme laisse passer un en-tête
   fourni par le client, le compteur se contourne en changeant une chaîne
   de caractères — et le rate limit ne protège plus rien. **Non vérifié** :
   ça se teste en une requête contre le Preview, avec un
   `x-forwarded-for` arbitraire, en regardant quelle valeur atterrit dans
   `patient_login_attempts.ip`. À faire avant de conclure quoi que ce soit.

Pistes, si le point 2 se confirme : compter aussi par code d'accès
(indépendamment de l'IP), et prendre l'IP depuis un en-tête que la
plateforme garantit plutôt que depuis le premier élément d'un en-tête que
n'importe qui peut écrire.

### `npm run lint` échoue sur le harnais

`tests/security/rls.spec.ts:79` — `PATIENT_B_CODE` est assigné et jamais
utilisé (`@typescript-eslint/no-unused-vars`). Antérieur au lot 8, présent
à l'identique sur `main`. Soit la constante a un usage prévu qui n'a jamais
été écrit, soit c'est un vestige : à trancher en la supprimant ou en
l'utilisant, pas en désactivant la règle.

## LOT — `EspacePatient` charge ses données sans `.catch()`

**`src/pages/EspacePatient.tsx:2344` fait `void charger();`. La fonction
`charger()` n'a ni `try/catch` interne, ni `.catch()` à l'appel. Toute
exception qu'elle lève devient un rejet de promesse non intercepté, et
`setLoading(false)` n'est jamais atteint : l'écran du bénéficiaire reste
figé sur son chargement, indéfiniment, sans message.**

Relevé le 2026-09-03, en instruisant l'incident du portail patient.

### Pourquoi c'est un lot à part, et pas un détail

L'`ErrorBoundary` posé sur le portail (PR #33) **ne couvre pas ce cas**.
React ne remonte à une frontière d'erreur que ce qui est levé pendant le
rendu, dans un constructeur ou dans une méthode de cycle de vie. Un rejet
de promesse dans un `useEffect` passe à côté.

Les deux défauts se ressemblent de l'extérieur et ont la même victime :

| | Ce que voit le bénéficiaire | Qui l'attrape |
|---|---|---|
| Exception au rendu | écran **blanc** | `ErrorBoundaryPatient` (PR #33) |
| Rejet dans `charger()` | écran **figé** sur le chargement | **personne** |

**Un chargement infini est aussi mauvais qu'un écran blanc** pour quelqu'un
qui n'a ni console, ni recours, et qui arrête simplement de faire ses
exercices. Croire que la frontière d'erreur a réglé les deux serait
exactement le genre de conclusion que ce fichier existe pour empêcher.

### Ce qu'il faut faire

1. Envelopper le corps de `charger()`, ou l'appel, de façon qu'un échec
   mène à un état affiché — pas à un silence. `setLoading(false)` doit être
   atteint dans **tous** les chemins.
2. Distinguer les causes plutôt que de tout renvoyer sur `accessDenied` :
   un réseau coupé, un 500, et un jeton refusé ne demandent pas le même
   geste au bénéficiaire. Aujourd'hui `!result.ok` mène à
   `<Navigate to="/patient" replace />` quel que soit le motif — un
   bénéficiaire renvoyé à l'écran de saisie de code alors que son code est
   bon retape son code, échoue à nouveau, et conclut que « ça ne marche
   plus ».
3. Prouver le correctif en le voyant rougir : forcer `patientFetchMe` à
   rejeter, constater l'écran obtenu. Un `.catch()` qu'on n'a jamais vu
   s'exécuter ne prouve rien (voir le corollaire en tête de ce fichier).

### Voisin, relevé au même endroit : le `?code=` reste dans l'URL

`EspacePatient` lit `searchParams.get('code')` et ouvre la session, mais
**ne nettoie jamais l'URL** — aucun `replaceState`, aucun `navigate` de
remplacement (vérifié le 2026-09-03). Le code d'accès reste donc dans la
barre d'adresse et dans l'historique du navigateur après connexion.

Ce n'est pas une donnée : c'est un justificatif qui ouvre le dossier de
santé **en écriture** et n'expire pas. Le point devient sensible maintenant
que `scripts/liens-acces-beneficiaires.ts` fabrique des liens qui portent
ce code — acceptable sur l'appareil personnel du bénéficiaire, pas sur un
poste partagé. Correctif : après une connexion réussie par `?code=`,
remplacer l'URL par `/patient/<id>` sans paramètre.

## RETOURS DE PIERRE — reçus le 2026-09-13, triés le jour même

**Source : `Retour_Pierre.pdf`, remis par Pierre. Dix-huit points, dont
douze numérotés par lui et six en liste libre d'en-tête.**

Ce tri est celui de la session du 2026-09-13. Il classe par **mode d'échec**,
pas par la priorité annoncée dans le PDF : un bug qui produit une donnée
fausse sans le dire passe devant un bug visible, quelle que soit l'étiquette
posée par Pierre.

Les priorités 🔴 / 🟠 ci-dessous sont celles de Pierre, conservées telles
quelles. Le classement en sections est le nôtre et diverge parfois du sien —
c'est voulu, et signalé au cas par cas.

### Déjà traité, à vérifier avant de reprogrammer

| # | Élément | État |
|---|---|---|
| 11 | 🟠 Dossier « Fin de contrat » | **Probablement livré** le 2026-09-12 (chantier archivage, `participants.archive` + `date_archivage`). Décrit exactement le besoin : archivage sans suppression, dossier conservé, réactivation possible. **Reste à faire** : Pierre veut trois onglets (Indépendant / Structure / Fin de contrat) là où le toggle « Afficher les archivés » a été livré sur la grille de `Dashboard.tsx`. Ajustement d'interface, pas un chantier |
| 01 | 🔴 Séances passées qui disparaissent du calendrier | **Clos** le 2026-09-12. N'était pas un bug applicatif : le flux `.ics` n'exportait que le futur, par spécification. Fenêtre portée à 24 mois d'historique |
| 02 | 🔴 Contrats à durée déterminée | **Clos** le 2026-09-13. `duree_indeterminee` était un booléen cosmétique posé à côté d'une `date_fin` réelle calculée à +6 mois en silence. Renouvellement automatique annuel désormais porté par le cron |

### BLOQUANT BÊTA — l'application produit des données fausses sans le dire

**C'est la catégorie la plus grave de la liste, et elle ne correspond pas à
l'ordre du PDF.** Ces trois points ont le même mode d'échec : un résultat
plausible, affiché sans erreur, sur des données de santé. Pierre ne peut pas
les repérer à l'œil, et les comptes rendus qui en découlent héritent du
défaut.

| # | Élément | Ce qu'il faut en faire |
|---|---|---|
| 05 | 🔴 Scores inversés — fatigue et activité physique | Une personne assise < 2 h/jour obtient un score **plus mauvais** qu'une personne assise > 5 h. Si l'inversion de pondération est confirmée, **tous les questionnaires déjà remplis sont faux**. Le correctif ne suffit pas : il faut recalculer l'existant, ou le marquer comme non fiable |
| 10.1 | 🔴 Le Scratch Test ne sauvegarde pas les modifications | Perte de données silencieuse sur un bilan clinique. Pierre saisit, enregistre, les valeurs disparaissent. Diagnostiquer où la chaîne casse : lecture, écriture, ou réaffichage |
| — | Normes des tests : handgrip (âge/sexe), souplesse, Dubois | **Ce ne sont pas des tâches de développement.** Les barèmes cliniques ne s'inventent ni ne se « corrigent » par un agent : Pierre fournit les références, étude à l'appui. Le travail technique est d'appliquer ces normes et **d'afficher laquelle est utilisée**, ce que le handgrip ne fait pas aujourd'hui |

⚠️ **Règle pour le point des normes** : aucun barème ne doit être écrit dans
le code sans source citée en commentaire. Un chiffre sans provenance est
indistinguable d'une invention, et personne ne pourra le revérifier.

### AVANT LA BÊTA

| # | Élément | Note |
|---|---|---|
| 03 | 🔴 Date de naissance non saisissable au clavier sur téléphone | **À faire en premier.** Correctif minuscule, gêne quotidienne maximale — sélecteur année par année pour une personne née en 1957. Meilleur rapport effort/soulagement de toute la liste |
| 08 | 🔴 Page « Progrès / Suivi » vide côté bénéficiaire | Visible par les bénéficiaires eux-mêmes. **Commencer par le diagnostic** : données absentes, mal liées, ou simplement pas affichées ? Les trois demandent des correctifs différents |
| — | « Ne plus avoir 2 agendas sur l'application » | **À clarifier avec Pierre** avant toute estimation — on ne sait pas ce qu'il voit. Un utilisateur qui ignore quel agenda fait foi est un problème de confiance, pas d'ergonomie |
| — | Onglet pour signaler un bug depuis l'application | Petit à construire, **change tout pour une bêta** : les retours arrivent avec leur contexte au lieu de transiter par un PDF quinze jours plus tard. Ce document existe parce que ce canal n'existe pas |
| — | Lier l'agenda au téléphone | Le flux `.ics` existe (`api/planning/ics.ts`). Vérifier ce qui manque côté Pierre : abonnement non configuré, ou attente différente |

### APRÈS LE LANCEMENT

| # | Élément | Note |
|---|---|---|
| 07 | 🟠 Paramètres financiers par personne | **Deuxième moitié du bug 01.** Pierre a demandé que ses séances passées restent visibles *pour faire ses factures* ; les tarifs verrouillés par personne complètent ce besoin. Son point sur la conservation du tarif applicable **au moment de la séance** est juste — c'est la partie qu'on rate facilement, et elle se conçoit dès le départ ou jamais |
| 12 | 🟠 Séances collectives | **Le seul point qui touche le modèle de données en profondeur** : une séance rattachée à N bénéficiaires, sans conflit d'agenda, tout en apparaissant dans l'historique individuel de chacun. Ce n'est pas une fonctionnalité de plus, c'est une refonte. À ne pas lancer dans la même semaine qu'autre chose |
| 04 | 🔴 Refonte du test de marche de 6 minutes | Pierre le classe 🔴 mais l'annonce lui-même comme « gros travail » à cadrer ensemble. Tableau trop chargé, stepper non actualisé, fonctionnement à revoir. **Nécessite une session de cadrage avec Pierre avant toute ligne de code** |
| 06 | 🟠 Coordonnées des professionnels autour de la personne | Médecin, kiné, infirmier. Ajout de schéma simple, sans dépendance |
| 09 | 🟠 Export PDF des programmes et séances | Côté praticien et côté bénéficiaire. `DossierPDF.tsx` existe déjà — vérifier ce qui est réutilisable |
| 10.2 | 🟠 Intitulé « Souplesse — Distance doigts-sol » | Renommage. À faire en même temps que la vérification des normes de souplesse, même test |
| — | Couleurs personnalisables des séances (bilan, réunion, séance, lieu) | Confort d'organisation |
| — | Événements d'agenda avec titre, nom, adresse, téléphone | Recoupe partiellement `evenements_agenda`, déjà en base |
| — | Renommer les dossiers de la bibliothèque | Petit |

### Ce que cette liste apprend sur le canal de retour

Pierre a accumulé dix-huit points dans un document avant de les transmettre.
Deux conséquences, toutes deux visibles dans ce PDF :

- **Les descriptions sont écrites après coup**, de mémoire, parfois à
  distance du moment où le problème est survenu. Le bug 01 en est
  l'illustration : « les séances disparaissent du calendrier » désignait en
  réalité Google Agenda, pas l'application — l'information manquante a coûté
  un diagnostic entier avant qu'une question directe ne la donne.
- **Aucune capture d'écran n'accompagne les points**, alors que le modèle de
  tableau en fin de document prévoit une colonne « Photos », restée vide.

L'onglet de signalement (section « avant la bêta ») répond directement à ces
deux points : un retour émis depuis l'écran concerné porte son contexte avec
lui. C'est la raison de le classer avant le lancement plutôt qu'après.
