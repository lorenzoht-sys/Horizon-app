# CLAUDE.md

Horizon (Mouv'APA, package `mouvtrack`) : application web de suivi des bilans
fonctionnels en Activité Physique Adaptée. Elle a trois espaces : praticien
(Supabase Auth), patient (PWA, code d'accès) et portail structure (lien à
token). **L'application traite des données de santé.**

## Stack

- **Front** : React 19, Vite, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Tailwind CSS 3, React Router 7, `sonner` (toasts), `lucide-react`, Chart.js / Recharts, Leaflet, `vite-plugin-pwa`.
- **Données** : Supabase (Postgres, Auth, RLS). Le client front est dans `src/lib/supabase.ts`.
- **Backend** : fonctions serverless Vercel dans `api/` (1 fichier = 1 route, clé `service_role`). Les helpers partagés sont dans `api/_lib/`. Config TS dédiée NodeNext (`api/tsconfig.json`) : les imports relatifs portent l'extension `.js`.
- **Edge Functions Supabase** : `supabase/functions/` (Deno).
- **Supervision** : Sentry (prod uniquement, sans données de santé, voir `docs/SENTRY.md`).
- **Déploiement** : Vercel. Un push sur `main` part en **production** (Supabase `rjgzeuywwknubpwigozq`). Les autres branches et les PR ont un Preview sur le Supabase de **staging**.

## Commandes

```bash
npm run dev             # Vite seul : les routes /api/* ne tournent pas en local
npm run build           # tsc -b + vite build + postbuild manifeste PWA
npm run lint            # ESLint (erreurs pré-existantes, absent de la CI)
npm run typecheck:api   # tsc sur api/
npm run typecheck:e2e   # tsc sur e2e/
npm run test:unit       # Vitest (api/, src/lib/, src/utils/, supabase/functions/, tests/security/)
npm run test:unit:ci    # Vitest sans tests/security/ (ce que lance la CI)
npm run test:security   # harnais RLS contre staging (scripts/run-harnais-local.mjs)
npm run test:e2e        # Playwright : sans E2E_BASE_URL, tout est skip
```

Un seul test : `npx vitest run api/_lib/rappels.test.ts` ou `npx playwright test e2e/06-connexion-patient.spec.ts`.

La CI (`.github/workflows/ci.yml`) enchaîne build, `typecheck:api`, `typecheck:e2e` et `test:unit:ci`, puis l'e2e sur le Preview Vercel du commit testé. `security.yml` fait tourner le harnais RLS.

## Structure

- `src/pages/` : pages desktop. `src/pages/mobile/AppMobile.tsx` porte les écrans mobiles natifs.
- `src/lib/` : logique métier pure, testée en `*.test.ts` à côté du fichier. `src/lib/routesMobile.ts` gère le routage mobile.
- `src/components/`, `src/hooks/` (hooks Supabase `useXxx`), `src/utils/`, `src/data/` (référentiels de tests).
- `api/patient/`, `api/structure/`, `api/cron/`, `api/planning/`, `api/seances/` : les routes. Les tests unitaires dans `api/` hors `_lib` sont préfixés `_` (ex. `api/patient/_me.test.ts`) pour ne pas devenir des fonctions Vercel.
- `supabase/migrations/AAAAMMJJ_description.sql` : la seule voie de changement de schéma, jamais Supabase Studio. Voir `supabase/migrations/README.md`.
- `e2e/` : Playwright, avec les parcours mobiles dans `e2e/mobile/`. Lire `e2e/README.md`.
- `scripts/` : scripts ponctuels, dont beaucoup ciblent staging (`staging-*.ts`, `seed-staging.sql`).

## Conventions

- Code, noms, commentaires, commits et docs **en français**. Les commits suivent les Conventional Commits avec un scope, par exemple `feat(patient): …` ou `fix(e2e): …`, suivis du numéro de PR.
- Les commentaires expliquent le *pourquoi* et l'historique d'une décision (date, incident, PR), pas le *quoi*.
- Les migrations sont idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` puis `CREATE POLICY`).
- Variables serveur (`SUPABASE_SERVICE_ROLE_KEY`, `PATIENT_SESSION_SECRET`, `ANTHROPIC_API_KEY`) : jamais de préfixe `VITE_`.
- Avant un merge sur `main` : `CHECKLIST_RELEASE.md`.

## Règles de travail (à respecter systématiquement)

- Jamais de select suivi de delete dans le même script. Toute suppression
  ou modification en masse porte son propre filtre explicite (par
  identifiant précis), jamais hérité d'une lecture précédente sans
  refiltrer. Vérifier le compte avant/après toute suppression.
- Aucun merge de PR, aucune migration appliquée en production ou staging,
  aucune écriture en masse sans l'accord explicite de l'utilisateur dans
  la conversation en cours.
- Toute migration SQL doit inclure un bloc de contrôle final (RAISE
  EXCEPTION si l'état attendu n'est pas atteint) et respecter la règle du
  2026-08-29 : REVOKE explicite puis GRANT ciblé à service_role pour toute
  nouvelle table (aucun privilège par défaut).
- Les tests e2e locaux ciblent par défaut le Preview staging persistant,
  pas le code de la branche en cours (voir e2e/README.md) — toujours
  vérifier E2E_BASE_URL avant de conclure qu'un test reflète le code
  local. La CI de la PR (vrai Preview Vercel) fait foi en cas de doute.
- Le rate-limit de connexion patient (5 tentatives/15min/IP) est partagé
  par tous les tests e2e d'un même run. Ne pas le relever ; réduire plutôt
  les connexions patient consommées par les tests (retries: 0,
  écriture directe via client admin quand c'est équivalent).
  Ne pas modifier retries au niveau global de playwright.config.ts.
  Désactiver les retries au niveau du describe pour les fichiers de test
  qui consomment une connexion patient
  (test.describe.configure({ retries: 0 })).
- Données de santé : aucun nom de bénéficiaire réel dans le dépôt, les
  logs, les migrations commitées ou les rapports. Anonymiser avant de
  committer un script de diagnostic.
- Plafond de 12 fonctions serverless sur Vercel (dossier api/) : toute
  nouvelle action patient passe par un type dans /api/patient/activite.ts
  plutôt qu'une nouvelle route.
- Mobile : interface en portrait uniquement (jamais de bascule paysage
  requise). Pages fusionnées via estRouteInterfaceUnique
  (src/lib/routesMobile.ts) ; AppMobile.tsx pour les écrans natifs
  dupliqués (ex. Tournée, Agenda). Toujours vérifier le recouvrement de
  la barre de navigation basse et les conflits de z-index par mesure
  réelle, pas par supposition.
- Avant tout chantier : lire le code réel plutôt que de se fier à un
  diagnostic ou cadrage antérieur — il s'est trompé sur la structure
  réelle dans la majorité des chantiers passés de ce projet.
- Tout changement de comportement visible côté desktop, même mineur, doit
  être signalé séparément et explicitement dans le rapport final, jamais
  glissé en passant.
