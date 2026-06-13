# Rapport de consolidation — branche `consolidation` (Checkpoint B)

Ce document résume tout ce qui a été fait sur la branche `consolidation`,
et surtout **ce qu'il reste à faire à la main** (Lorenzo) avant et après le
merge vers `main`. Rien n'a été poussé sur `main`, et **aucune commande SQL
n'a été exécutée sur la base de production** : tout est dans cette branche,
prêt à être relu.

---

## 1. Résumé en une phrase

Le code mort a été supprimé, le schéma de base de données est désormais
versionné et documenté, un environnement de staging et une suite de tests
E2E + CI ont été mis en place, la supervision d'erreurs (Sentry) et un
journal d'audit des accès patient ont été ajoutés — sans introduire de
nouvelle fonctionnalité visible (hors le journal d'audit, le seul ajout
prévu pour la conformité).

---

## 2. État des 8 tâches

| Tâche | Statut | Commit | Résumé |
|-------|--------|--------|--------|
| T1 | ✅ Fait | `fe886a8` | `AUDIT.md` : état des lieux complet (arborescence, code mort, dépendances, doublons, tables hors-migration). |
| T2 | ✅ Fait | `3b66a2d` | Suppression de 16 fichiers source morts (3625 lignes) + 74 fichiers de debug/captures suivis par erreur ; nettoyage `package.json` (deps inutilisées/manquantes). |
| T3 | ✅ Fait | `6e27c53` | `supabase init` + 6 nouvelles migrations versionnées (table manquante, RLS, rate limiting, journal d'accès structure) ; suppression de `sql/` (scripts "à la main"). |
| T4 | ✅ Fait | `016daa1` | Config centralisée (`src/lib/config.ts`), suppression des URLs codées en dur, jeu de données fictif + procédure de staging Supabase/Vercel. |
| T5 | ✅ Fait | `8ba7357` | 10 specs Playwright (parcours praticien/patient/structure) + CI GitHub Actions (`build` + `e2e` conditionnel). |
| T6 | ✅ Fait | `3796ad7` | Sentry (front + `api/*`), désactivé sauf en Production, `beforeSend`/`beforeBreadcrumb` privacy-safe. |
| T7 | ✅ Fait | `89bb701` | Table `audit_logs` (migration SQL) + journalisation des connexions/accès patient — **seule fonctionnalité visible ajoutée** (conformité). |
| T8 | ✅ Fait | `4f616ac` | README réécrit, `CHECKLIST_RELEASE.md`, `docs/BRANCH_PROTECTION.md`, `docs/PITR.md`. |

Aucune tâche n'est **BLOQUÉE**.

---

## 3. Détail par tâche

### T1 — Audit (`AUDIT.md`)
État des lieux factuel : arborescence commentée, code mort, dépendances npm
inutilisées/manquantes, doublons (programme V1/V2), 5 tables actives mais
absentes des migrations, table `bilans_brouillons` référencée mais
inexistante (404 connu).

### T2 — Grand ménage
- 16 fichiers source morts supprimés (composants/pages/jeux de données démo
  jamais importés), 3625 lignes.
- 74 fichiers de debug suivis par erreur dans git (captures d'écran,
  scripts `*.mjs` ad-hoc, `test-results/`) supprimés après vérification
  qu'ils n'étaient référencés nulle part.
- `package.json` : retrait de `html2pdf.js`/`@types/html2pdf.js`,
  `react-hot-toast`, `react-countup` (inutilisés) ; ajout de `html2canvas`
  (utilisé mais non déclaré).
- Corrections de deux estimations erronées dans `AUDIT.md` (console.log,
  faux positifs TODO/FIXME).

### T3 — Migrations SQL versionnées
- `supabase init` : ajout de `supabase/config.toml` et `supabase/.gitignore`.
- 6 nouvelles migrations dans `supabase/migrations/20260613_*.sql` :
  - `create_bilans_brouillons` — corrige le 404 connu (table absente).
  - `programme_v2_rls` — RLS + policies praticien-only sur les 5 tables
    "programme V2" créées hors-repo.
  - `rls_anon_lockdown` — verrouille le rôle `anon`.
  - `patient_login_rate_limit` — table de rate limiting connexion patient.
  - `structure_access_logs` — journal d'accès au portail structure.
  - `audit_logs` (T7) — journal d'audit accès patient.
- Suppression de `sql/` (scripts "branche sécurisation" intégrés aux
  migrations ci-dessus).
- `supabase/migrations/README.md` : règle d'or — tout changement de schéma
  passe désormais par un fichier de migration versionné.

**⚠️ Aucune de ces 6 migrations n'a encore été appliquée en production.**
Voir section 4.

### T4 — Environnement de staging
- `src/lib/config.ts` centralise `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  et `getAppHost()` (adaptation automatique prod/preview).
- Suppression des URLs codées en dur (`horizon-app-dusky.vercel.app`) dans
  3 fichiers.
- `scripts/seed-staging.sql` : données 100% fictives (Camille Martin /
  `camille2026`, Julien Bernard / `julien2026`, structure de démo).
- `supabase/migrations/SETUP_STAGING.md` : procédure complète (nouveau
  projet Supabase, configuration Vercel par environnement).

**Cet environnement de staging n'est pas encore créé** — c'est un
prérequis pour activer pleinement T5 (job `e2e` de la CI). Voir section 4.

### T5 — Tests Playwright + CI
- 10 specs Playwright (`e2e/01-...spec.ts` à `e2e/10-...spec.ts`) couvrant
  connexion praticien, création patient/bilan/programme/contrat, export PDF,
  connexion patient, séance du jour, portail structure, rate-limit de
  `/api/patient/login`.
- Suppression de l'ancienne suite `e2e/*.cjs` (debug ad-hoc).
- `playwright.config.ts`, `e2e/helpers.ts`, `e2e/tsconfig.json`,
  `e2e/README.md`.
- `.github/workflows/ci.yml` : job `build` (toujours actif —
  `npm run build` + `typecheck:api` + `typecheck:e2e`, sans `lint` car 209
  erreurs ESLint pré-existantes hors périmètre) + job `e2e` (actif
  seulement si l'environnement de staging/Preview est configuré).
- `package.json` : scripts `typecheck:api`, `typecheck:e2e`, `test:e2e`.

**Sans l'environnement de staging (T4) configuré dans Vercel/GitHub, le job
`e2e` reste inactif** (la CI passe quand même, le job `build` suffit).

### T6 — Sentry (supervision des erreurs)
- `api/_lib/sentry.ts` : `withSentry(handler)` enveloppe les 5 routes
  `/api/*` (`claude.ts`, `patient/login.ts`, `patient/me.ts`,
  `patient/seance.ts`, `structure/data.ts`) — capture les exceptions non
  gérées, répond 500 JSON proprement.
- `src/lib/sentry.ts` : `initSentry()` côté front, appelé depuis
  `src/main.tsx`.
- **Désactivé partout sauf si `SENTRY_DSN` / `VITE_SENTRY_DSN` sont définis**
  (à faire uniquement dans Vercel > Production, voir `docs/SENTRY.md`) :
  aucun appel réseau, aucun changement de comportement en dev/preview/staging
  tant que ces variables ne sont pas configurées.
- Confidentialité : `sendDefaultPii: false`, `tracesSampleRate: 0`, corps de
  requête/cookies/en-têtes d'auth retirés côté serveur, URLs nettoyées
  (UUID → `:id`, token structure → `:token`, query string/hash retirés,
  breadcrumbs `console` supprimés) côté front.

**Sentry n'est pas activé** (aucune variable configurée) — c'est optionnel,
à activer quand tu le souhaites via `docs/SENTRY.md`.

### T7 — Journal d'audit accès patient (`audit_logs`)
- Migration `supabase/migrations/20260613_audit_logs.sql` : table
  `audit_logs` (event_type, participant_id, ip, success, created_at), RLS
  activé, lecture réservée au praticien propriétaire du participant.
- `api/_lib/patientAuth.ts` : nouvelle fonction `logAuditEvent(...)`.
- Journalisation dans :
  - `api/patient/login.ts` — `patient_login` (succès, échec rate-limit,
    échec code invalide).
  - `api/patient/me.ts` — `patient_data_access` (succès / patient
    introuvable).
  - `api/patient/seance.ts` — `patient_seance_submit` (succès / échec
    enregistrement).
- Aucune donnée de santé stockée : uniquement type d'événement, identifiant
  participant, IP, succès/échec, date.

**C'est la seule fonctionnalité visible ajoutée** par la consolidation
(visible uniquement par le praticien, via une future requête sur la table —
aucune UI n'a été ajoutée, conformément à la consigne "zéro nouvelle
fonctionnalité visible").

### T8 — Garde-fous
- `README.md` réécrit pour refléter l'application actuelle (3 espaces :
  praticien, patient, structure ; stack ; structure du dépôt ; scripts ;
  déploiement).
- `CHECKLIST_RELEASE.md` : checklist avant tout merge vers `main`
  (vérifications automatiques, migrations, variables d'env, vérification
  manuelle "site en marche", supervision, après-merge).
- `docs/BRANCH_PROTECTION.md` : procédure GitHub pour protéger `main`
  (PR obligatoire, check `build` requis).
- `docs/PITR.md` : procédure de vérification/activation de la sauvegarde à
  la minute (Point in Time Recovery) sur le projet Supabase de production.

---

## 4. Actions manuelles à faire (Lorenzo) — récapitulatif

Rien de ce qui suit n'a été exécuté par Claude. Voici, dans un ordre
suggéré, tout ce qui reste à faire :

### Avant de merger `consolidation` → `main`

1. **Relire ce rapport et le diff** de la branche `consolidation`.
2. **Appliquer les 6 migrations SQL en attente** sur la base de production
   (`supabase link --project-ref rjgzeuywwknubpwigozq` puis
   `supabase db push`, ou copier-coller dans le SQL Editor — voir
   `supabase/migrations/README.md`) :
   - `20260613_create_bilans_brouillons.sql`
   - `20260613_programme_v2_rls.sql`
   - `20260613_rls_anon_lockdown.sql`
   - `20260613_patient_login_rate_limit.sql`
   - `20260613_structure_access_logs.sql`
   - `20260613_audit_logs.sql`

   ⚠️ Les 3 premières viennent de `RAPPORT_SECURISATION.md` (branche
   `securisation`, déjà mergée) et étaient peut-être déjà en attente avant
   cette consolidation — vérifie dans le SQL Editor si les tables/policies
   existent déjà avant de rejouer (les fichiers sont idempotents,
   `CREATE ... IF NOT EXISTS` / `DROP POLICY IF EXISTS`, donc rejouer ne
   casse rien si déjà appliqué).
3. **Suivre la `CHECKLIST_RELEASE.md`** (vérifications tsc/build/CI déjà
   vertes sur cette branche, vérification manuelle "site en marche" sur un
   déploiement Preview).
4. Merger `consolidation` → `main` (PR classique).

### Après le merge (peut être fait progressivement)

5. **Mettre en place l'environnement de staging** (`supabase/migrations/SETUP_STAGING.md`)
   pour activer le job `e2e` de la CI et pouvoir tester sans toucher aux
   vraies données.
6. **Protéger la branche `main`** sur GitHub (`docs/BRANCH_PROTECTION.md`).
7. **Vérifier/activer PITR** sur le projet Supabase de production
   (`docs/PITR.md`).
8. **(Optionnel) Activer Sentry** (`docs/SENTRY.md`) pour être notifié des
   erreurs en production.

---

## 5. Points de vigilance / hors périmètre

- **`xlsx` (vulnérabilité npm, sévérité haute)** : prototype pollution +
  ReDoS, pas de correctif disponible. Préexistant, sans rapport avec cette
  consolidation. À surveiller (changement de bibliothèque d'import Excel à
  envisager un jour, hors périmètre ici).
- **209 erreurs ESLint préexistantes** : volontairement non corrigées (hors
  périmètre, la CI ne lance pas `npm run lint` pour cette raison — voir
  `.github/workflows/ci.yml`).
- **Pas de PITR actif par défaut** : à vérifier/activer selon le plan
  Supabase (voir `docs/PITR.md`).

---

## 6. Vérifications finales

Sur chaque tâche (T1 à T8) : `npx tsc --noEmit`, `npm run typecheck:api`,
`npm run build` (et `npm run typecheck:e2e` pour T5/T6/T7) ont été exécutés
avec succès avant chaque commit. Aucune tâche n'a nécessité de revert.

Historique des commits de la branche (du plus ancien au plus récent) :

```
fe886a8 [consolidation] T1: etat des lieux (AUDIT.md)
3b66a2d [consolidation] T2: grand menage - code mort, deps inutilisees, fichiers de debug
6e27c53 [consolidation] T3: migrations SQL versionnees (supabase init + RLS/rate limit/audit)
016daa1 [consolidation] T4: environnement de staging
8ba7357 [consolidation] T5: suite Playwright E2E + CI GitHub Actions
3796ad7 [consolidation] T6: Sentry (front + api), prod-only et privacy-safe
89bb701 [consolidation] T7: journal d'audit des acces a l'espace patient (audit_logs)
4f616ac [consolidation] T8: garde-fous (README, checklist de release, branch protection, PITR)
```
