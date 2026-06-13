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
| `E2E_BASE_URL` | oui (sinon tout est skip) | — | URL du déploiement à tester (ex : URL d'un Preview Vercel) |
| `E2E_PRATICIEN_EMAIL` | pour les tests praticien (1, 2, 3, 4, 5, 10) | — | Email du compte praticien de staging (`staging.praticien@example.com`) |
| `E2E_PRATICIEN_PASSWORD` | pour les tests praticien | — | Mot de passe de ce compte |
| `E2E_PATIENT_CODE` | non | `camille2026` | Code d'accès du patient de démo "Camille" (a des bilans + programme) |
| `E2E_PATIENT_PRENOM` | non | `Camille` | Prénom correspondant |
| `E2E_PATIENT_NOM` | non | `Martin` | Nom correspondant |
| `E2E_PATIENT_CODE_2` | non | `julien2026` | Code d'accès du patient de démo "Julien" (rattaché à une structure, sans bilan/programme) |
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
9. `09-rate-limit-connexion-patient` — limitation (429) après plusieurs codes invalides sur `/api/patient/login`.
10. `10-creation-contrat` — création d'un contrat de suivi pour Julien.

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
  cette suite contre le Preview de staging. `E2E_PRATICIEN_PASSWORD` doit
  être ajouté comme **secret** (pas une variable), les autres `E2E_*` comme
  **variables**.
