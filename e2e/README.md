# Tests end-to-end (Playwright) — Tâche 5

Cette suite teste l'application **réelle** (front + routes `/api/*`), via
Playwright. Comme il n'y a pas de CLI Vercel installé, `/api/*` n'est pas
disponible avec `npm run dev` (Vite seul) : la suite cible donc un
**déploiement Preview Vercel**, branché sur le **projet Supabase de
staging** (voir `supabase/migrations/SETUP_STAGING.md`).

## Pourquoi tout est ignoré par défaut

Sans variable d'environnement `E2E_BASE_URL`, **tous les tests sont
ignorés** (`test.skip()`), pas en échec. Cela permet de lancer
`npx playwright test` (et la CI) sans configuration préalable, en attendant
la mise en place du staging.

## Variables d'environnement

| Variable | Obligatoire | Valeur par défaut | Description |
|---|---|---|---|
| `E2E_BASE_URL` | oui (sinon tout est skip) | — | URL du déploiement à tester (ex : URL d'un Preview Vercel). **En CI, cette variable n'est plus une URL figée** : le workflow la résout à chaque run (voir plus bas) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | oui contre un Preview Vercel | — | Secret « Protection Bypass for Automation » du projet Vercel. Sans lui, la protection de déploiement renvoie toute requête vers le SSO et **aucun test ne peut atteindre l'application** |
| `E2E_PRATICIEN_EMAIL` | pour les tests praticien (1, 2, 3, 4, 5, 10) | — | Email du compte praticien de staging (`staging.praticien@example.com`) |
| `E2E_PRATICIEN_PASSWORD` | pour les tests praticien | — | Mot de passe de ce compte |
| `E2E_PATIENT_CODE` | non | `CAME2E26` | Code d'accès (code_acces) du patient de démo "Camille" (a des bilans + programme) |
| `E2E_PATIENT_PRENOM` | non | `Camille` | Prénom correspondant |
| `E2E_PATIENT_NOM` | non | `Martin` | Nom correspondant |
| `E2E_PATIENT_CODE_2` | non | `JUNE2E27` | Code d'accès (code_acces) du patient de démo "Julien" (rattaché à une structure, sans bilan/programme) |
| `E2E_PATIENT_PRENOM_2` | non | `Julien` | Prénom correspondant |
| `E2E_PATIENT_NOM_2` | non | `Bernard` | Nom correspondant |
| `E2E_STRUCTURE_TOKEN` | non | `staging-token-demo-0001` | Token du portail structure de démo |

Les valeurs par défaut correspondent aux données de
`scripts/seed-staging.sql`.

## Lancer la suite localement

```bash
# 1. Configurer les variables (PowerShell)
$env:E2E_BASE_URL = "https://<preview-url>.vercel.app"
$env:E2E_PRATICIEN_EMAIL = "staging.praticien@example.com"
$env:E2E_PRATICIEN_PASSWORD = "..."

# 2. Installer les navigateurs Playwright (une seule fois)
npx playwright install --with-deps chromium

# 3. Lancer la suite
npm run test:e2e
```

## Que couvre la suite

1. `01-connexion-praticien` — connexion d'un praticien et accès au tableau de bord.
2. `02-creation-patient` — création d'une nouvelle fiche participant.
3. `03-creation-bilan` — création d'un nouveau bilan pour Camille.
4. `04-export-pdf-bilan` — génération du PDF d'un bilan existant.
5. `05-creation-programme` — création et partage d'un programme pour Julien.
6. `06-connexion-patient` — connexion patient (Camille) via son code d'accès.
7. `07-seance-coche-exercice` — réalisation et enregistrement de la séance du jour de Camille.
8. `08-portail-structure` — portail structure avec token valide et invalide.
9. `09-rate-limit-connexion-patient` — limitation (429) après plusieurs codes invalides sur `/api/patient/session`.
10. `10-creation-contrat` — création d'un contrat de suivi pour Julien.
11. `11-rappels-patient` — la section "Rappels" (notifications push) est visible dans l'espace patient de Camille.
12. `12-rappels-praticien` — réglages globaux de rappels (Paramètres) et personnalisation par patient (fiche de Camille, onglet "Rappels").

## ⚠️ Les tests créent des données dans le projet de staging

Les tests 2, 5 et 10 **créent de nouveaux enregistrements** (participant,
programme, contrat + séances) à chaque exécution — le projet Supabase de
staging grossit donc au fil du temps. C'est attendu (données 100%
fictives), mais il peut être utile de **ré-exécuter périodiquement
`scripts/seed-staging.sql`** (ou de recréer le projet de staging) pour
repartir d'une base propre.

## CI

`.github/workflows/ci.yml` :

- Job `build` (toujours exécuté) : `npm ci`, `npm run build`,
  `npm run typecheck:api`, `npm run typecheck:e2e`. Volontairement **sans**
  `npm run lint` (erreurs de lint pré-existantes, hors périmètre — voir
  `AUDIT.md`).
- Job `e2e` (exécuté seulement si la variable de dépôt `E2E_BASE_URL` est
  configurée dans **Settings > Secrets and variables > Actions**) : lance
  cette suite contre un Preview Vercel. `E2E_PRATICIEN_PASSWORD` et
  `VERCEL_AUTOMATION_BYPASS_SECRET` doivent être ajoutés comme **secrets**
  (pas des variables), les autres `E2E_*` comme **variables**.

### Comment la cible est choisie en CI

`E2E_BASE_URL` ne sert plus que d'**interrupteur** : tant qu'elle est vide,
le job est ignoré. L'URL réellement testée est résolue à chaque run à partir
du commit testé :

- **sur une pull request** → le Preview de la PR elle-même ;
- **sur un push sur `main`** → `main` part en *Production*, donc sur la base
  Supabase de **production** : jamais une cible de test acceptable. Le
  workflow resynchronise la branche `staging` sur le commit poussé et teste
  **son** Preview (environnement Vercel *Preview* = Supabase de staging).

Le workflow attend que le déploiement Vercel correspondant soit `success`
(15 min max) avant de lancer Playwright, via l'API GitHub Deployments.

### Deux pièges déjà rencontrés

1. **Protection de déploiement.** Le projet a
   `ssoProtection: all_except_custom_domains` : tout Preview est derrière
   l'authentification Vercel. Sans `VERCEL_AUTOMATION_BYPASS_SECRET`, chaque
   requête est redirigée (302) vers le SSO. Symptôme observé le 2026-08-27 :
   une douzaine de `locator.fill: Test timeout` et de `getByText`
   introuvables — douze symptômes pour une cause unique, extérieure au code
   testé. `e2e/global-setup.ts` sonde désormais la cible avant le premier
   test et arrête la suite avec un message explicite.
2. **Cible périmée.** L'ancienne `E2E_BASE_URL` pointait sur le Preview d'une
   branche `staging` figée, qui avait fini 46 commits derrière `main` : la CI
   validait du code vieux de cinq jours. D'où la résolution par commit
   décrite ci-dessus.
