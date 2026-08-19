# Migrations Supabase — règle d'or et procédures

## Règle d'or (à partir de maintenant)

**Tout changement de schéma (nouvelle table, nouvelle colonne, nouvelle
policy RLS, nouvel index, etc.) doit passer par un nouveau fichier dans ce
dossier**, jamais par une modification directe dans Supabase Studio.

Convention de nommage (reprise des fichiers existants) :

```
supabase/migrations/AAAAMMJJ_description_courte.sql
```

Étapes pour une nouvelle migration :

1. Créer le fichier `supabase/migrations/AAAAMMJJ_ma_modif.sql` avec le SQL
   (idéalement idempotent : `CREATE TABLE IF NOT EXISTS`,
   `DROP POLICY IF EXISTS` puis `CREATE POLICY`, etc.).
2. Relire le fichier.
3. L'appliquer à la production :
   ```bash
   supabase link --project-ref rjgzeuywwknubpwigozq
   supabase db push
   ```
   (`db push` n'applique que les migrations pas encore marquées comme
   appliquées sur le projet lié.)
4. Committer le fichier de migration dans git.

⚠️ Comme toujours dans ce projet : **aucune commande SQL n'est exécutée
automatiquement par Claude sur la base de production**. Les migrations sont
écrites dans ce dossier ; c'est toi (Lorenzo) qui exécutes `supabase db push`
(ou copies-colles le SQL dans le SQL Editor de Supabase) après relecture.

## État actuel de l'historique (Tâche 3 — consolidation)

- Les fichiers `20260529_*.sql` à `20260611_*.sql` (18 fichiers) existaient
  déjà avant la Tâche 3 : ils documentent les évolutions de schéma faites au
  fil du temps.
- Les 5 fichiers `20260613_*.sql` sont nouveaux (Tâche 3) :
  - `20260613_create_bilans_brouillons.sql` — crée la table manquante qui
    causait le 404 `bilans_brouillons` (voir `AUDIT.md` §7).
  - `20260613_programme_v2_rls.sql` — active RLS + policies praticien-only
    sur les 5 tables "programme V2" créées hors-repo via Supabase Studio
    (voir `AUDIT.md` §6) : `seances_patient`, `exercices_realises`,
    `programme_seances`, `programme_planning`, `programme_exercices`.
  - `20260613_rls_anon_lockdown.sql` — verrouille le rôle `anon`
    (anciennement `sql/rls_final.sql`, sections 1/2/3/5/6).
  - `20260613_patient_login_rate_limit.sql` — anciennement
    `sql/t3_patient_rate_limit.sql`.
  - `20260613_structure_access_logs.sql` — anciennement
    `sql/t5_structure_access.sql`.

  Ces 3 derniers fichiers (RLS, rate limit, journal d'accès structure)
  n'ont **pas encore été appliqués en production** — c'est l'étape 1 de
  `RAPPORT_SECURISATION.md`, toujours à faire. Une fois appliqués via
  `supabase db push`, ils seront marqués comme tels et ne seront plus
  rejoués.

## Nouvelle table (Tâche 7 — consolidation)

- `20260613_audit_logs.sql` — crée la table `audit_logs` (journal d'audit des
  connexions et accès à l'espace patient, voir `api/_lib/patientAuth.ts`).
  Pas encore appliquée en production : à exécuter via `supabase db push` en
  même temps que les fichiers ci-dessus.

## Migrations ajoutées depuis la consolidation

- `20260614_add_code_acces_participants.sql` — code d'accès patient unique
  (`participants.code_acces`), voir `RAPPORT_CODE_ACCES.md`.
- `20260615_rappels_patients.sql` — tables des rappels automatiques patients
  (`push_subscriptions`, `rappel_preferences`, `rappels_envoyes`), voir
  `RAPPORT_RAPPELS.md`.
- `20260616_cron_rappels_patients.sql` — job pg_cron de rappels pour la
  **production** (placeholders `<VOTRE_URL_VERCEL>` / `<VOTRE_CRON_SECRET>`).
  `20260616_cron_rappels_patients_staging.sql` est la variante pour
  l'environnement de staging (job renommé `rappels-patients-horaire-staging`).

Comme les fichiers `20260613_*`, ces 3 fichiers sont idempotents et leur
statut "appliqué en prod ou non" doit être vérifié avant de les rejouer
ailleurs. Pour l'environnement de **staging**, la liste à jour et l'ordre
d'application sont dans `GUIDE_STAGING.md` (Étape 2.2).

## Correctif — `20260613_rls_anon_lockdown.sql`

Ce fichier référençait `documents_patient`, `documents_partages` et la
fonction `get_praticien_structure()` : ces objets ont des migrations dans ce
dossier (`20260603_documents_patient.sql`, `20260607_documents_partages.sql`,
`20260607_praticien_portail_structure.sql`) et l'affirmation ci-dessous
(conservée pour l'historique) disait qu'ils n'existaient pas réellement en
production. Le fichier a été corrigé pour retirer ces références (sections
renumérotées 1 à 4) afin de pouvoir être rejoué proprement sur staging et sur
toute future réinstallation, sans adaptation manuelle.

**⚠️ Correction 2026-08-17 (audit sécurité, branche `audit-securite-global`)**
: l'affirmation ci-dessus est **fausse**. Vérifié par requête live sur la
base de production (`information_schema.tables`, `pg_proc`) : `documents_partages`,
`bilans_brouillons` et `get_praticien_structure()` **existent bel et bien en
production** — créés hors de tout fichier de migration versionné (constat
identique pour les policies de `tm6_variantes`, voir
`docs/RAPPORT_SECURITE.md` F-10/F-01). **Ne pas se fier à ce dossier seul
pour connaître l'état réel de la base** — en cas de doute, vérifier par une
requête live (voir `docs/RAPPORT_SECURITE.md`, section "Limite connue", pour
la procédure de diff prod/staging/migrations, pas encore exécutée à ce jour).

## ⚠️ Limite connue : ce dossier ne suffit PAS à recréer la base depuis zéro

Les tables "de base" du projet (`participants`, `praticiens`, `bilans`,
`contrats`, `programmes`, `seances`, etc.) ont été créées **avant** la mise
en place de ce dossier de migrations (avant le 29/05/2026) — il n'existe
**aucun fichier `CREATE TABLE`** pour elles ici. Rejouer uniquement les
fichiers de ce dossier sur une base vide échouera donc (`ALTER TABLE` sur
des tables qui n'existent pas).

C'est pour ça que l'environnement de staging ne se base pas sur "rejouer
toutes les migrations depuis zéro", mais sur une **copie complète du schéma
de production** (`supabase db dump`), suivie de l'application des migrations
listées dans `GUIDE_STAGING.md` (Étape 2.2). La procédure détaillée est dans
`GUIDE_STAGING.md` (à la racine du dépôt).

## Générer un instantané de référence du schéma actuel (optionnel)

Pour avoir une copie lisible du schéma complet de production à un instant
donné (utile pour relire/comparer, ou en cas de restauration) :

```bash
supabase link --project-ref rjgzeuywwknubpwigozq
supabase db dump --schema public -f supabase/schema_dump_reference.sql
```

Ce fichier est un **instantané** (snapshot), pas une migration : ne pas le
mettre dans `supabase/migrations/` (il serait rejoué et entrerait en
conflit avec les migrations incrémentales ci-dessus). Il remplace
`supabase/schema.sql` (l'ancien fichier écrit à la main, maintenant marqué
obsolète) comme référence "à jour" du schéma — à régénérer de temps en temps
si besoin.

## Note sur les doublons de préfixe de date

Plusieurs fichiers existants partagent le même préfixe de date (par ex.
trois fichiers `20260604_*.sql`, trois `20260603_*.sql`). Le Supabase CLI
identifie chaque migration par son **nom de fichier complet**, donc cela
fonctionne pour `db push`/`db pull` au fil du temps — mais si tu utilises un
jour `supabase migration repair`, donne le nom de fichier complet (pas
seulement les 8 chiffres) pour cibler la bonne migration.
