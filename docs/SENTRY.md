# Mise en place de Sentry (Tâche 6)

Sentry est un outil de **suivi d'erreurs** (error tracking) : quand le code
plante (front ou serverless), il envoie automatiquement le détail de l'erreur
(message, pile d'appels, route concernée) vers un tableau de bord, sans
attendre qu'un utilisateur signale le bug.

Le code de cette intégration est déjà en place (`src/lib/sentry.ts` et
`api/_lib/sentry.ts`) mais **désactivé tant qu'aucune variable d'environnement
n'est configurée**. Cette page explique comment l'activer, **uniquement pour
la Production**.

⚠️ Comme pour les migrations et le staging : **aucune des étapes ci-dessous
n'a été exécutée par Claude**. C'est une procédure à suivre toi-même
(Lorenzo), une seule fois, quand tu seras prêt.

## Comportement actuel (sans rien faire)

- En local (`npm run dev`) : Sentry ne fait rien (aucune variable définie).
- Sur les Preview Deployments (staging) : idem, Sentry ne fait rien.
- Sur la Production (déploiement de `main`) : idem, **tant que les variables
  ci-dessous ne sont pas ajoutées dans Vercel**.

Donc tant que tu n'as pas suivi les étapes ci-dessous, rien ne change : zéro
appel réseau supplémentaire, zéro comportement modifié.

## Étape 1 — Créer un projet Sentry

1. Va sur https://sentry.io et crée un compte (ou connecte-toi).
2. Crée une nouvelle **Organization** (ou utilise une existante).
3. Crée deux projets :
   - Un projet **React** (plateforme "React") — pour le front (`src/`).
   - Un projet **Node.js** (plateforme "Node.js") — pour les routes
     serverless (`api/*`).
4. Pour chaque projet, va dans **Settings > Client Keys (DSN)** et copie le
   **DSN** (une URL du type `https://xxxx@xxxx.ingest.sentry.io/xxxx`).

## Étape 2 — Configurer les variables dans Vercel (Production uniquement)

Sur https://vercel.com — projet **horizon-app** — **Settings > Environment
Variables** :

| Variable           | Valeur                          | Environnements à cocher |
|---------------------|---------------------------------|---------------------------|
| `VITE_SENTRY_DSN`   | DSN du projet Sentry **React**   | **Production** uniquement |
| `SENTRY_DSN`        | DSN du projet Sentry **Node.js** | **Production** uniquement |

Pour chaque variable, dans le formulaire d'ajout : ne coche **que
Production**, décoche **Preview** et **Development**. C'est ce qui garantit
que Sentry reste désactivé en local et sur les Preview Deployments (qui
utilisent les données fictives de staging, voir
`supabase/migrations/SETUP_STAGING.md`).

## Étape 3 — Redéployer

Un nouveau déploiement de `main` (Production) est nécessaire pour que Vercel
prenne en compte les nouvelles variables. Le prochain push sur `main` suffit.

## Étape 4 — Vérifier

1. Sur le site en production, provoque une erreur (par exemple en appelant
   une route `/api/...` avec des paramètres invalides, ou en regardant une
   page qui logge une erreur).
2. Va sur https://sentry.io, ouvre le projet correspondant (React ou
   Node.js), et vérifie qu'un nouvel événement apparaît dans **Issues**.

## Confidentialité — ce qui est filtré avant envoi à Sentry

Cette application gère des données de santé. L'intégration est configurée
pour **ne jamais transmettre** :

- `sendDefaultPii: false` — aucune IP, cookie ou information personnelle par
  défaut.
- `tracesSampleRate: 0` — aucune trace de performance (uniquement les
  erreurs).
- **Côté serveur** (`api/_lib/sentry.ts`) : le corps des requêtes (`request.data`
  — peut contenir des prompts envoyés à `/api/claude` ou des codes patient),
  les cookies, et les en-têtes `Authorization`/`Cookie` sont retirés avant
  l'envoi.
- **Côté front** (`src/lib/sentry.ts`) :
  - Les URLs des erreurs et des breadcrumbs sont nettoyées : la query string
    et le `#hash` sont retirés, les identifiants UUID (participant, séance,
    bilan...) sont remplacés par `:id`, et les tokens de portail structure
    (`/structure/<token>`) sont remplacés par `/structure/:token`.
  - Les breadcrumbs de catégorie `console` (issus de `console.log` /
    `console.error`) sont entièrement supprimés, pour éviter qu'une donnée
    affichée par erreur dans la console finisse dans Sentry.

## Désactiver Sentry

Pour désactiver Sentry à tout moment (sans toucher au code) : supprime ou
vide les variables `VITE_SENTRY_DSN` et `SENTRY_DSN` dans Vercel, puis
redéploie. Les deux intégrations deviennent immédiatement des no-op.
