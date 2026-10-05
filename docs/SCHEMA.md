# Schéma de la base — règles et procédures

Instantané de référence : production (`rjgzeuywwknubpwigozq`), relevé le
2026-10-05, 53 tables, 124 policies, 104 index, 13 fonctions, 29 triggers.

## 1. La règle

**Plus aucune modification de la base hors migration.** Ni Supabase Studio, ni
SQL Editor, ni script ponctuel qui change le schéma, les policies, les grants,
les fonctions ou les jobs cron. Tout passe par un fichier dans
`supabase/migrations/`, relu, testé en local, puis appliqué à staging, puis à
la production.

Pourquoi : jusqu'au 2026-10-05, les tables du cœur (`praticiens`,
`participants`, `contrats`, `seances`, `bilans`…) avaient été créées hors dépôt
et l'historique des migrations de production était vide. Le dépôt ne permettait
pas de recréer la base. Il le permet maintenant, à condition que cette règle
tienne.

## 2. Organisation du dossier `supabase/`

| Chemin | Rôle |
|---|---|
| `migrations/20260528000000_baseline_schema_prod.sql` | **Migration de base** : reconstitution exacte de la production au 2026-10-05. Jamais rejouée en production. |
| `migrations/AAAAMMJJHHMMSS_*.sql` | Migrations postérieures à la base. |
| `migrations_archive/` | Les 98 anciennes migrations (29/05 → 29/09/2026), conservées pour l'historique et pour les scripts de staging. **Ne plus les exécuter** : leurs effets sont déjà dans la base de production et donc dans la migration de base. |
| `seed.sql` | Données locales fictives, chargées par `supabase db reset`. |
| `seeds/`, `verifications/`, `verifs/` | Seeds de démonstration et requêtes de contrôle ponctuelles. |
| `_prod_*` (ignoré par git) | Instantanés de production, régénérables, voir §5. |

## 3. Créer, tester et appliquer une migration

### 3.1 Créer

Nom : `AAAAMMJJHHMMSS_description_courte.sql`, **14 chiffres**.

> Le CLI Supabase identifie une migration par son préfixe numérique. Deux
> fichiers avec le même préfixe à 8 chiffres (cas de plusieurs anciens
> fichiers) entrent en collision. Avec l'horodatage complet, c'est impossible.

```bash
supabase migration new ma_modification   # crée le fichier horodaté
```

Contenu obligatoire (voir `CLAUDE.md`) :

- idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` puis `CREATE POLICY`) ;
- **nouvelle table** : `ENABLE ROW LEVEL SECURITY`, puis `REVOKE ALL` explicite
  et `GRANT` ciblé à `service_role` (aucun privilège par défaut). Attention :
  en production, les privilèges par défaut du rôle `postgres` accordent `ALL`
  à `authenticated` et `service_role` sur toute nouvelle table. Le `REVOKE`
  explicite est donc indispensable ;
- un **bloc de contrôle final** (`DO $$ … RAISE EXCEPTION … $$`) qui échoue si
  l'état attendu n'est pas atteint ;
- ne jamais mettre de secret, d'URL de déploiement ou de nom de bénéficiaire
  réel (un job cron s'écrit avec des placeholders, comme l'existant).

### 3.2 Tester en local

```bash
supabase start        # une fois (Docker Desktop doit tourner)
supabase db reset     # base vierge : migration de base + migrations + seed.sql
```

`db reset` doit se terminer sans erreur : c'est le test que le dépôt recrée
bien la base. Les blocs de contrôle de la base et du seed s'exécutent à cette
occasion. Pour vérifier le comportement de la migration elle-même, interrogez
la base locale (`supabase db query --local "…"` ou `psql` sur
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

Pour vérifier qu'une base locale est toujours identique à la production :

```bash
supabase db dump --linked -f supabase/_prod_schema_dump.sql
supabase db dump --local  -f /tmp/local_dump.sql
diff <(grep -v '^$' supabase/_prod_schema_dump.sql) <(grep -v '^$' /tmp/local_dump.sql)
```

### 3.3 Appliquer

Jamais automatiquement, jamais sans accord explicite (`CLAUDE.md`).

1. **Staging** d'abord (projet `nnfkchhtjrferxnwlcxp`), en vérifiant le projet
   lié avant chaque commande : `cat supabase/.temp/project-ref`.
2. Vérifier la PR (CI + Preview sur staging).
3. **Production** : `supabase db push --dry-run`, relire la liste, puis
   `supabase db push`. Le dry-run ne doit lister **que** la nouvelle migration.
   S'il liste la migration de base ou d'anciennes migrations, **arrêter** : voir
   §4.

## 4. Réaligner l'historique des migrations de production (une seule fois)

État constaté le 2026-10-05 : la table `supabase_migrations.schema_migrations`
n'existe pas en production. Les 98 migrations y ont été appliquées à la main
(SQL Editor) sans trace. Un `supabase db push` tenterait donc de rejouer la
migration de base sur une base qui contient déjà tout, et échouerait ou, pire,
altérerait des objets.

On marque simplement la migration de base comme appliquée. Cette commande
n'exécute **aucun** SQL de schéma : elle crée la table d'historique et y inscrit
une ligne.

```bash
supabase link --project-ref rjgzeuywwknubpwigozq
supabase migration repair --status applied 20260528000000
supabase migration list --linked      # local et remote doivent être alignés
supabase db push --dry-run            # doit répondre : Remote database is up to date.
```

À faire ensuite, de la même façon, sur staging (voir §6 pour ses écarts).

## 5. Recréer une base locale

Prérequis : Docker Desktop lancé, CLI Supabase (`brew install supabase/tap/supabase`).

```bash
supabase start      # première fois : télécharge les images (plusieurs minutes)
supabase db reset   # recrée tout depuis les migrations puis charge seed.sql
supabase status     # URL et clés locales (clés de démonstration, non secrètes)
```

Lancer le front sur cette base, sans écrire de fichier d'environnement :

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<ANON_KEY affichée par supabase status> npm run dev
```

`npm run dev` ne sert pas les routes `/api/*` (voir `CLAUDE.md`) : l'espace
patient et le portail structure ne fonctionnent pas en local sans `vercel dev`.

Comptes du seed (local uniquement, mot de passe factice commun
`SeedLocal-2026!`) : `admin@seed.test`, `pro-sap@seed.test`,
`pro-simple@seed.test`. Contenu : 1 admin, 2 praticiens (un avec n° SAP), 3
bénéficiaires, 3 contrats, séances sur le mois précédent et le mois en cours,
et un changement de tarif (45 € → 50 € + 5 € de déplacement) sur le contrat du
bénéficiaire A.

Pour régénérer les instantanés de production (lecture seule, ignorés par git) :

```bash
supabase link --project-ref rjgzeuywwknubpwigozq
supabase migration list --linked > supabase/_prod_migration_list.txt
supabase db dump --linked -f supabase/_prod_schema_dump.sql
```

## 6. Limites connues de la migration de base

- **Job pg_cron** `rappels-patients-horaire` (`15 * * * *`) : absent de la
  migration de base, car sa commande contient l'URL Vercel et le secret du
  cron. Sur une base neuve, il se crée avec `20260912_cron_fusion_rappels_renouvellement.sql`
  (archive, placeholders `<VOTRE_URL_VERCEL>` / `<VOTRE_CRON_SECRET>`).
- **Corps de fonctions** : la production contient des accents mal encodés dans
  quelques commentaires de fonctions (`dÃ©jÃ`). La migration de base les
  reproduit à l'identique, par fidélité. Une migration de nettoyage pourra les
  corriger plus tard.
- **Pas de bucket de stockage** ni de policy `storage` en production : rien à
  recréer.
- **Staging n'est pas identique à la production** (relevé du 2026-10-05) : la
  table `tarifs_contrats` y est sans policy, sans index ni grant, et
  `frais_deplacement` n'a pas de valeur par défaut ; plusieurs grants diffèrent ;
  le défaut de `participants.visibilite_beneficiaire` est plus ancien. Staging
  n'a pas non plus de table d'historique de migrations.

### Migrations écrites mais pas appliquées en production

Constatées en rejouant l'archive sur la migration de base. Toutes deux portent
la mention « NE PAS EXÉCUTER SUR PROD sans validation ». Elles ne sont **pas**
reprises dans `migrations/` : à vous de décider si elles doivent partir.

| Archive | Écart avec la production |
|---|---|
| `20260914_retrait_visibilite_progression.sql` | La clé `progression` est encore présente (11 bénéficiaires sur 41). Attention : le `SET DEFAULT` de ce fichier réécrit le défaut **sans** `messagePraticien`, ajouté auparavant par `20260831`. À corriger avant de la rejouer. |
| `20260911_02_jours_fixe_contrats.sql` | La contrainte `contrats_jours_fixe_non_vide` est absente (aucun contrat ne la violerait aujourd'hui). |

Autres écarts constatés (index et policies jamais créés, ou retirés, en
production) : index `idx_assistant_logs_*`, `idx_factures_*` dont l'unique
`idx_factures_unique`, `idx_participants_structure` ; policies `al_*` sur
`assistant_logs` (table à RLS activée **sans** policy, donc accessible
uniquement via `service_role`). `factures_suivi` est vide en production.

## 7. Sauvegardes : ce que je n'ai pas pu confirmer

Voir la liste de contrôle ci-dessous et `docs/PITR.md` pour l'activation.

Relevé en lecture seule (CLI) sur la production, le 2026-10-05 :
`pitr_enabled: false`, `walg_enabled: true`, **liste de sauvegardes vide**.

À vérifier dans la console (Settings → Billing, puis Database → Backups) :

1. **Plan de l'organisation** : Free, Pro, Team ?
2. **Sauvegardes quotidiennes** : y en a-t-il, quelle est la date de la
   dernière ? (Le Free n'en fournit pas de téléchargeable. Le Pro en conserve
   7 jours.)
3. **PITR** : activé ? Fenêtre de rétention (7, 14 ou 28 jours) ?
4. **Restauration** : peut-on restaurer à une date et à une heure précises ?
   Vers un nouveau projet ? Quel délai ?
5. **Dernier test de restauration** réussi, et sa date.
6. **Hébergement en région UE** (`eu-west-3` d'après le CLI) et conformité
   HDS : les données de santé exigent un hébergeur HDS. À confirmer avec
   Supabase.
7. Un export de secours hors Supabase (`pg_dump` chiffré, planifié) existe-t-il ?

**Le plan actuel ne suffit pas pour des données de facturation** s'il se
confirme qu'il n'y a ni sauvegarde quotidienne ni PITR : des factures émises
sont des pièces comptables (conservation 10 ans) et ne se recréent pas. Le
minimum raisonnable avant d'émettre une première facture : plan Pro avec
sauvegardes quotidiennes, idéalement PITR (7 jours), et un export chiffré
régulier hors Supabase.
