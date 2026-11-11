# Architecture d'Horizon

Vue d'ensemble pour quelqu'un qui découvre le projet. Le détail table par
table est dans `docs/CARTOGRAPHIE-DONNEES.md` (généré), le schéma dans
`docs/SCHEMA.md`, la migration HDS dans `clevercloud/README.md`.

## Trois espaces, deux chemins vers les données

| Espace | Chemin | Qui contrôle l'accès | Authentification |
| --- | --- | --- | --- |
| Praticien | navigateur → `supabase-js` → PostgREST → Postgres | la RLS en base (`auth.uid()`) | Supabase Auth, e-mail et mot de passe |
| Patient (PWA) | navigateur → `api/patient/*` → Postgres | le code de la route (clé `service_role`) | code d'accès, puis jeton signé par l'API |
| Structure | navigateur → `api/structure/data` → Postgres | le code de la route (clé `service_role`) | jeton en en-tête |

Conséquence : une faille côté praticien se cherche dans les politiques RLS
(`supabase/migrations/`), une faille côté patient ou structure dans
`api/_lib/` (`patientAuth`, `structureAuth`, `guard`).

## Couches du front (`src/`)

```
pages/, components/     affichage et interactions ; AUCUNE requête
        │
hooks/                  un hook par domaine (useParticipants, useAgenda, useContrats…) :
        │               état + requêtes du domaine
lib/acces/              requêtes hors hook, par domaine (praticien, assistant, sauvegarde…)
lib/                    logique métier pure, testée à côté (*.test.ts)
        │
lib/supabase.ts         client unique
lib/session.ts          identité du praticien connecté (utilisateurCourant)
lib/patientApi.ts, lib/structureApi.ts    appels aux routes api/
```

Deux règles sont vérifiées par des tests, qui échouent si on les enfreint :

1. **Aucune requête dans `pages/` ni `components/`** (`src/lib/acces/couches.test.ts`).
2. **L'identité du praticien se lit par `utilisateurCourant()`**, jamais par
   `supabase.auth.getUser()` (`src/lib/session.test.ts`).

La session praticien se ferme après une heure sans interaction
(`src/lib/inactivite.ts`, `src/hooks/useDeconnexionInactivite.ts`).

Elles existent pour que changer de source de données ou de fournisseur
d'authentification se fasse dans une couche connue.

Autres dossiers : `data/` (référentiels statiques d'exercices et de tests, sans accès à la base),
`types/` (types partagés), `utils/` (fonctions sans état),
`pages/mobile/` (`AppMobile.tsx` aiguille vers les écrans natifs de
`pages/mobile/ecrans/` ; les autres routes mobiles réutilisent les pages
desktop, voir `lib/routesMobile.ts`).

Un écran volumineux est découpé en un fichier par sous-écran, dans un dossier
à son nom : `pages/espace-patient/`, `pages/fiche-beneficiaire/`,
`pages/mobile/ecrans/`, `components/participant/formulaire/`. Le fichier
d'origine ne garde que le composant principal.

## Serveur

- `api/` : 12 routes serverless (1 fichier = 1 route), helpers dans
  `api/_lib/`. Tests unitaires préfixés `_` pour ne pas devenir des routes.
- `supabase/functions/` : 3 Edge Functions Deno (`analyser-seance`,
  `facturation-envoi`, `facturation-pdf`).
- `api/cron/rappels` : point d'entrée unique des tâches planifiées (rappels,
  renouvellement des contrats, facturation mensuelle), appelé toutes les
  heures par `pg_cron`.

## Base de données

- 62 tables, RLS partout, 31 migrations versionnées dans
  `supabase/migrations/` : seule voie de changement de schéma.
- Les règles sensibles sont en base, pas dans l'interface : inaltérabilité et
  numérotation des factures, consentement RGPD obligatoire à la création d'un
  bénéficiaire, suppression bloquée s'il existe un historique financier.

## Tests et CI

| Niveau | Outil | Où |
| --- | --- | --- |
| Logique métier | Vitest | `*.test.ts` à côté du fichier (`src/lib/`, `api/`) |
| Sécurité RLS | Vitest contre staging | `tests/security/` (72 cas) |
| Base de facturation | Vitest contre une base locale | `tests/db/` |
| Parcours | Playwright sur le Preview Vercel | `e2e/` (65 tests) |

La CI lance tout sur chaque PR. L'e2e tourne un run à la fois (staging
partagé) après remise à zéro du jeu de démo
(`scripts/staging-reset-etat-e2e.ts`).

## Environnements

| | Front et API | Base |
| --- | --- | --- |
| Production | Vercel, branche `main` | Supabase production |
| Preview | Vercel, toute autre branche | Supabase staging, données fictives |

Aucune écriture en production par script ou par IA : migrations appliquées à
la main par le responsable du projet (`CHECKLIST_RELEASE.md`).

## Dette connue

- `ParticipantProfile` et `ParticipantForm` font encore environ 1 400 lignes
  chacun : leurs sous-composants sont sortis (`src/pages/fiche-beneficiaire/`,
  `src/components/participant/formulaire/`), mais le composant principal reste
  une seule fonction. À découper par onglet ou par étape.
- `useAgenda` charge toutes les séances dans chaque composant qui l'appelle :
  pas d'état partagé entre écrans.
- `src/lib/acces/` renvoie les requêtes Supabase telles quelles : c'est une
  frontière, pas encore une abstraction. Suffisant pour une migration qui
  garde PostgREST.
- Plusieurs bibliothèques PDF coexistent (`@react-pdf/renderer`, `jspdf`,
  `pdfmake`, `pdf-lib`).
- ESLint n'est pas dans la CI (erreurs préexistantes).
