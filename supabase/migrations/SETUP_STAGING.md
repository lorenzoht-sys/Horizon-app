# Mise en place d'un environnement de staging (Tâche 4)

Ce document explique comment créer un **deuxième projet Supabase**, séparé de
la production, et le brancher sur les **Preview Deployments** de Vercel.
Objectif : pouvoir tester (manuellement ou via Playwright — Tâche 5) sans
jamais toucher aux vraies données patients.

```
                Production (branche main)         Preview (PRs / autres branches)
                       |                                      |
                       v                                      v
              Projet Supabase PROD                  Projet Supabase STAGING
              (rjgzeuywwknubpwigozq)                (nouveau, créé ci-dessous)
              vraies données patients               données 100% fictives
                                                      (scripts/seed-staging.sql)
```

⚠️ Comme pour les migrations : **aucune des commandes ci-dessous n'a été
exécutée par Claude**. C'est une procédure à suivre toi-même (Lorenzo), une
seule fois.

## Étape 1 — Créer le projet Supabase de staging

1. Va sur https://supabase.com/dashboard/projects et clique **New project**.
2. Choisis la même organisation que le projet de production (`horizon-app`),
   donne-lui un nom clair, par exemple **`horizon-app-staging`**.
3. Choisis la même région que la production (pour limiter les écarts) et
   définis un mot de passe de base de données — note-le, tu en auras besoin
   pour le SQL Editor si besoin.
4. Attends la fin de la création (1-2 minutes), puis note le **project ref**
   du nouveau projet (visible dans l'URL du dashboard :
   `supabase.com/dashboard/project/<CE_REF>`).

## Étape 2 — Recopier le schéma de production vers staging

Le dossier `supabase/migrations/` ne suffit pas pour recréer la base depuis
zéro (voir `supabase/migrations/README.md`, section "Limite connue"). On
recopie donc d'abord une **photo complète du schéma actuel de production**.

1. Lie le CLI au projet de **production** (s'il ne l'est pas déjà) :
   ```bash
   supabase link --project-ref rjgzeuywwknubpwigozq
   ```
2. Génère une copie du schéma (tables, colonnes, policies RLS, fonctions...) :
   ```bash
   supabase db dump --schema public -f supabase/_staging_schema_dump.sql
   ```
   Ce fichier est **temporaire** : ne le commite pas (il est listé dans
   `.gitignore`), supprime-le une fois l'étape 3 terminée.
3. Ouvre le projet de **staging** sur le dashboard Supabase, va dans
   **SQL Editor > New query**, colle l'intégralité du contenu de
   `supabase/_staging_schema_dump.sql`, puis clique **Run**. Cela recrée
   toutes les tables, index, fonctions et policies RLS telles qu'elles
   existent actuellement en production.

## Étape 3 — Appliquer les migrations pas encore en production

Regarde la section "État actuel de l'historique" de
`supabase/migrations/README.md` pour savoir si les fichiers
`20260613_*.sql` ont déjà été appliqués en production (via `supabase db
push`) **avant** que tu aies fait l'étape 2 ci-dessus :

- Si **oui** (déjà appliqués en prod avant le dump) : ils sont déjà inclus
  dans `_staging_schema_dump.sql`, rien à faire de plus.
- Si **non** : pour chaque fichier `20260613_*.sql` non encore appliqué en
  prod, ouvre-le, copie son contenu, colle-le dans le SQL Editor du projet
  de **staging** et clique **Run** (même procédure que pour la prod, mais
  sur le projet de staging).

## Étape 4 — Récupérer les clés API du projet de staging

Dans le projet de staging : **Project Settings > API**.

- **Project URL** → ce sera `VITE_SUPABASE_URL` pour l'environnement Preview.
- **anon public key** → ce sera `VITE_SUPABASE_ANON_KEY` pour l'environnement
  Preview.
- **service_role key** → ce sera `SUPABASE_SERVICE_ROLE_KEY` pour
  l'environnement Preview (utilisé par les routes `api/*`).

## Étape 5 — Créer le compte praticien de test et injecter les données fictives

1. Dans le projet de staging : **Authentication > Users > Add user**.
   - Email : `staging.praticien@example.com`
   - Coche **Auto Confirm User**.
   - Choisis un mot de passe que tu pourras réutiliser pour les tests
     manuels et Playwright (Tâche 5).
2. Toujours dans le projet de staging : **SQL Editor > New query**, colle le
   contenu de `scripts/seed-staging.sql`, clique **Run**. Cela crée :
   - le profil praticien de démo,
   - 2 participants fictifs (Camille Martin — code `camille2026` ; Julien
     Bernard — code `julien2026`),
   - des bilans, un programme, un contrat, des séances d'agenda,
   - une structure de test (`/structure/staging-token-demo-0001`).

## Étape 6 — Configurer Vercel (variables par environnement)

Sur https://vercel.com — projet **horizon-app** — **Settings > Environment
Variables**. Vercel permet de définir une valeur différente par
environnement (**Production**, **Preview**, **Development**).

Pour chacune des variables suivantes, vérifie/ajoute une valeur **spécifique
à l'environnement Preview** (en plus de la valeur Production déjà en place
qui pointe vers le vrai projet Supabase) :

| Variable                     | Production (déjà en place)        | Preview (à ajouter, valeurs de staging) |
|-------------------------------|------------------------------------|------------------------------------------|
| `VITE_SUPABASE_URL`           | URL du projet prod                 | URL du projet staging (étape 4)          |
| `VITE_SUPABASE_ANON_KEY`      | clé anon du projet prod            | clé anon du projet staging (étape 4)     |
| `SUPABASE_SERVICE_ROLE_KEY`   | clé service_role du projet prod    | clé service_role du projet staging       |
| `PATIENT_SESSION_SECRET`      | secret de prod                     | une autre valeur aléatoire (dédiée staging) |
| `ANTHROPIC_API_KEY`           | clé API de prod                    | peut rester la même, ou une clé dédiée si tu veux suivre l'usage séparément |

Pour ajouter une variable Preview-only : dans le formulaire d'ajout de
variable, décoche **Production** et **Development**, ne garde que
**Preview**.

➡️ Résultat : tout déploiement de la branche `main` (Production) continue
d'utiliser la vraie base ; tout autre déploiement (Preview — branches, PRs)
utilise automatiquement le projet de staging et ses données fictives.
Aucun changement de code n'est nécessaire : `src/lib/config.ts` lit ces
variables via `import.meta.env`, et `getAppHost()` s'adapte automatiquement
à l'URL du déploiement (prod ou preview).

## Étape 7 — Vérifier

1. Pousse une branche quelconque (ou ouvre une PR) pour déclencher un
   déploiement **Preview**.
2. Ouvre l'URL de preview, connecte-toi avec
   `staging.praticien@example.com`.
3. Vérifie que tu vois Camille Martin et Julien Bernard, avec leurs bilans /
   programme / séances de démonstration.
4. Teste la connexion patient avec le code `camille2026` et le portail
   structure `/structure/staging-token-demo-0001`.
5. Vérifie qu'un déploiement de `main` (Production) continue d'afficher les
   vraies données patients (aucun changement attendu côté prod).
