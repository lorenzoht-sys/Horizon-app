# Horizon (Mouv'APA) — suivi des participants

Application web pour un enseignant en Activité Physique Adaptée (APA) :
suivi des bilans fonctionnels, programmes d'exercices, agenda/tournée,
espace patient (PWA) et portail de suivi pour les structures partenaires.

## Stack technique

- **Front** : React 19 + Vite + TypeScript + Tailwind CSS
- **Données** : Supabase (Postgres + Auth + Row Level Security)
- **Backend** : fonctions serverless Vercel (`api/*`) — proxy sécurisé vers
  Supabase (clé `service_role`) et vers l'API Claude (assistant IA)
- **Hébergement** : Vercel (déploiement automatique sur `main`)
- **Tests** : Playwright (E2E) + GitHub Actions (CI)
- **Supervision** : Sentry (optionnel, prod uniquement — voir `docs/SENTRY.md`)

## Démarrage rapide

```bash
npm install
cp .env.example .env.local   # puis renseigner les variables Supabase (voir ci-dessous)
npm run dev
```

Ouvre ensuite [http://localhost:5173](http://localhost:5173).

### Variables d'environnement

Voir `.env.example` pour la liste complète et les commentaires. En résumé :

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` : projet Supabase (front et
  fonctions `api/*`).
- `SUPABASE_SERVICE_ROLE_KEY`, `PATIENT_SESSION_SECRET`, `ANTHROPIC_API_KEY` :
  **variables serveur uniquement** (jamais préfixées par `VITE_`), utilisées
  par `api/*` et configurées dans Vercel.
- `VITE_SENTRY_DSN` / `SENTRY_DSN` : optionnel, supervision des erreurs en
  production (voir `docs/SENTRY.md`).

En local, sans ces variables serveur, les routes `/api/*` ne fonctionnent
pas (mais l'app praticien fonctionne via le client Supabase `anon`).

## Les trois espaces de l'application

| Espace | Accès | Description |
|---|---|---|
| **Praticien** (`/`, `/participants/...`, `/agenda`, `/tournee`, `/exercices`, `/stats`, ...) | Compte Supabase Auth (email/mot de passe) | Tableau de bord, bilans fonctionnels, programmes d'exercices, agenda/tournée, statistiques, assistant IA. |
| **Patient** (`/patient`) | Code d'accès personnel (prénom + année) | PWA mobile : programme du jour, séances réalisées, historique — données servies par `/api/patient/*`. |
| **Structure** (`/structure/:token`) | Lien à token, sans compte | Portail de suivi en lecture pour une structure partenaire (participants, séances, factures, documents) — données servies par `/api/structure/data`. |

## Structure du dépôt

```
src/            Application praticien (React) — pages, composants, hooks Supabase
api/            Fonctions serverless Vercel ("1 fichier = 1 route", 12 au total)
  _lib/         Helpers partagés (auth patient/structure, rate limit, guard, Sentry)
  patient/      Routes de l'espace patient (session, me, seance, activite,
                retour-seance, push-subscribe)
  structure/    Route du portail structure (data)
  seances/      Suppression en masse des séances planifiées (fin de contrat)
  cron/         Endpoint déclenché par le job pg_cron (rappels patients)
  planning/     Flux iCalendar (webcal) du planning praticien
  claude.ts     Proxy sécurisé vers l'API Claude (assistant IA)
  organisation.ts  Demande de création d'organisation (mode multi-praticiens)
supabase/
  migrations/   Historique versionné du schéma (règle d'or : voir migrations/README.md)
  functions/    Edge Functions Supabase (analyser-seance, interpreter-bilan)
e2e/            Tests Playwright (parcours praticien, patient, structure)
docs/           Procédures de configuration manuelle (Sentry, branch protection, PITR...)
scripts/        Scripts ponctuels (ex. seed de l'environnement de staging)
```

## Scripts npm

```bash
npm run dev            # serveur de développement
npm run build           # build de production (tsc -b + vite build) → dist/
npm run preview         # prévisualiser le build
npm run lint             # ESLint
npm run typecheck:api    # tsc sur api/ (config dédiée NodeNext)
npm run typecheck:e2e    # tsc sur e2e/
npm run test:e2e         # suite Playwright (voir e2e/README.md)
```

## Tests et CI

Une suite de tests Playwright (`e2e/`) couvre les parcours principaux des
trois espaces (praticien, patient, structure). La CI GitHub Actions
(`.github/workflows/ci.yml`) exécute à chaque push/PR :

- build + `typecheck:api` + `typecheck:e2e` (job `build`, toujours actif) ;
- la suite E2E complète (job `e2e`), si un environnement de Preview/staging
  est configuré (variables de dépôt `E2E_*`, voir `e2e/README.md` et
  `supabase/migrations/SETUP_STAGING.md`).

## Déploiement

Le projet Vercel **horizon-app** déploie automatiquement :

- **Production** : tout push sur `main` → vraie base de données Supabase
  (projet `rjgzeuywwknubpwigozq`).
- **Preview** : toute autre branche / pull request → projet Supabase de
  staging avec des données fictives (voir
  `supabase/migrations/SETUP_STAGING.md`).

Avant de merger sur `main`, voir **`CHECKLIST_RELEASE.md`**.

## Sécurité, conformité et supervision

Cette application traite des données de santé. Plusieurs documents
encadrent ça :

- **`docs/RAPPORT_SECURITE.md`** — audit sécurité en cours (branche
  `audit-securite-global`) : findings RLS/API, statuts réels (corrigé en
  code / testé / appliqué sont trois choses différentes, jamais confondues
  dans ce rapport). **`docs/ETAT_AUDIT.md`** résume le blocage actuel et la
  règle en vigueur : aucun merge vers `main`, aucune migration de ce lot
  appliquée en prod tant que l'audit n'est pas clos. **`docs/MES_ACTIONS.md`**
  liste ce qui reste à faire manuellement (accès base, décisions produit).
- **`RAPPORT_SECURISATION.md`** — sécurisation des accès (auth serveur pour
  l'espace patient et le portail structure, RLS, rate limiting), antérieur
  à l'audit ci-dessus.
- **`AUDIT.md`** — état des lieux détaillé du code (Tâche 1, consolidation).
- **`supabase/migrations/`** — historique versionné du schéma (règle d'or :
  toute évolution passe par un fichier de migration, jamais une modification
  directe dans Supabase Studio).
- **Journal d'audit patient** (`audit_logs`, voir
  `supabase/migrations/20260613_audit_logs.sql`) — trace les connexions et
  accès aux données de santé de l'espace patient (sans jamais stocker les
  données elles-mêmes).
- **`docs/SENTRY.md`** — supervision des erreurs en production, configurée
  pour ne jamais transmettre de données de santé.
- **`docs/PITR.md`** — sauvegarde/restauration ponctuelle (Point-in-Time
  Recovery) de la base Supabase de production.
- **`docs/BRANCH_PROTECTION.md`** — protection de la branche `main` sur
  GitHub.
