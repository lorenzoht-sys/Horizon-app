# Plan bêta — points à traiter avant ouverture

## RÈGLE — migration en production AVANT le merge sur `main`

**Toute migration dont dépend du code applicatif doit être appliquée en
production AVANT que le code qui l'utilise soit mergé sur `main`.**

`main` déclenche un déploiement production automatique (Vercel). Les
migrations, elles, ne s'appliquent jamais toutes seules : ni la CI ni le
déploiement ne les exécutent. Merger du code qui référence une colonne, une
table ou une fonction absente de la base de production le met **en ligne
immédiatement, cassé**.

Ordre correct, sans exception :

1. Appliquer la migration en **production** (SQL Editor), et vérifier par
   requête qu'elle a bien pris.
2. Appliquer la migration en **staging**, vérifier via le harnais.
3. Merger le code sur `main`.

Ordre inverse = panne en production entre le merge et l'application de la
migration.

### Ce qui a rendu cette règle nécessaire (2026-08-26)

Le lot 7 (`20260819_structure_token_expiration.sql`) a été appliqué sur
staging, vérifié par le harnais, puis mergé. Le merge a déployé en
production `api/_lib/structureAuth.ts`, qui sélectionne `expires_at` — une
colonne alors absente de la base de production. PostgREST a renvoyé une
erreur, `validateStructureToken()` a renvoyé `null`, et **le portail
structure a répondu « Accès non autorisé » à tous les EHPAD**, jusqu'à
l'ajout manuel de la colonne.

Toutes les vérifications étaient au vert, harnais compris : elles portaient
sur staging, où la migration était appliquée. Aucune ne pouvait détecter
l'écart avec la production.

### Comment vérifier avant de merger

Requête à lancer dans le SQL Editor de production pour contrôler la présence
des objets attendus (à étendre à chaque nouvelle migration) :

```sql
SELECT 'claude_rate_limit (table)' AS objet,
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='claude_rate_limit') AS present
UNION ALL SELECT 'structures.expires_at (colonne)',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='structures' AND column_name='expires_at');
```

Tant qu'aucun garde-fou automatique n'existe (rien dans la CI ne compare le
schéma de production aux migrations du dépôt), cette vérification est
manuelle et fait partie de la revue de toute PR touchant `supabase/migrations/`.

## Échecs connus et acceptés du harnais `tests/security/rls.spec.ts`

Le job `audit` de `.github/workflows/security.yml` fait échouer la CI sur tout
skip ou tout échec du harnais — volontairement, pour ne jamais laisser un vert
silencieux masquer un test qui ne tourne pas vraiment (voir le commentaire en
tête de ce workflow). Cette liste est l'exception explicite à cette règle :
les échecs ci-dessous sont connus, expliqués, et acceptés jusqu'à ce que leur
cause soit traitée. **Toute CI rouge sur ce harnais doit d'abord être comparée
à cette liste avant d'être traitée comme un blocage** — si le test en échec
n'y figure pas, c'est une vraie régression, pas un faux positif connu.

Tenir cette liste à jour à chaque lot de l'étape 1 : si un lot corrige l'un de
ces points, le retirer d'ici dans la même PR (comme le lot 4 l'a fait pour
`[F-06]`, retiré de cette liste le 2026-08-26).

| Test | Raison | Ce qui débloquerait |
|---|---|---|
| `couverture complète : toute table public non testée ci-dessus est explicitement listée (EXCLUDED_TABLES ou TABLE_OVERRIDES)` | Tente de lister `information_schema.tables` via le client PostgREST (`SUPABASE_TEST_SERVICE_ROLE_KEY`), qui n'expose que les schémas `public`/`graphql_public` (voir `supabase/config.toml`) — `information_schema` n'y est jamais accessible, quel que soit le rôle. | Faire passer ce test sur la connexion Postgres directe (`STAGING_DATABASE_URL`), comme le bloc "Findings structurels" (F-05/F-07/F-08/F-09/F-10) plus bas dans le même fichier — reporté, décision explicite du 2026-08-26 de garder `STAGING_DATABASE_URL` en connexion directe plutôt que pooler, ce qui bloque déjà ce bloc en CI (`ENETUNREACH`, IPv6) et bloquerait pareillement ce test s'il migrait dessus tel quel. |

## Chantiers de sécurité identifiés mais non appliqués

Trouvés en préparant le lot 6 de l'étape 1 (rate limit `api/claude.ts`,
F-12) : `audit-securite-global` mélange ce correctif à 3 autres dans le même
commit (`d6be50f`, fichier `api/claude.ts`), jamais revus ni planifiés.
Ils ont l'air utiles mais n'ont pas été extraits — seul le rate limit l'a
été (voir `20260817_securite_08_rate_limit_claude.sql`). À traiter comme un
lot séparé, avec sa propre revue :

- **Plafond de taille de prompt** (`PROMPT_MAX_LENGTH`, `api/_lib/guard.js`
  sur `audit-securite-global`) — réduit l'abus de coût par des prompts
  démesurés. Absent de `main`.
- **Garde-fou anti prompt-injection** — message système dans `api/claude.ts`
  instruisant le modèle à ne jamais traiter le contenu utilisateur (notes
  cliniques, dictées patient) comme une instruction. Défense en profondeur,
  pas une garantie absolue vu que 8 appelants différents côté `src/`
  envoient des formats hétérogènes dans `prompt`.
- **Sanitisation des messages d'erreur** — remplace `String(err)` (peut
  exposer des détails internes au client) par un message générique
  `'Erreur serveur'` + `console.error` côté serveur, sur les deux `catch`
  de `api/claude.ts`.

### Code mort de l'ancienne architecture « client anon direct »

`MIGRATION_ANON.md` décrit le passage d'un accès Supabase anon direct
(portail structure) vers les routes serveur `GET /api/structure/*`
(service_role). Plusieurs vestiges de l'ancienne architecture n'ont jamais
été supprimés. Aucun n'a d'appelant — vérifié par `grep` sur `src/`, `api/`,
`scripts/`, `tests/`, `e2e/` :

- `src/hooks/useStructures.ts:verifierTokenStructure()` — validation de token
  côté client, sans auth. Zéro appelant. À noter : elle ne vérifie pas
  `expires_at` (le lot 7 ne l'a pas modifiée, faute d'appelant à protéger) —
  si elle était un jour réutilisée telle quelle, elle contournerait
  l'expiration ajoutée par [F-04]. À supprimer plutôt qu'à corriger.
- `get_praticien_structure(text)` et `structure_token_valide(uuid)` —
  fonctions Postgres, traitées par
  `20260826_revoke_public_execute_functions.sql` (REVOKE + DROP).

## Procédure de purge RGPD sur `audit_logs`

Depuis `20260817_securite_03_audit_logs_immuable.sql`, la table `public.audit_logs`
est protégée par un trigger `BEFORE UPDATE OR DELETE` (`trg_audit_logs_immuable`)
qui lève systématiquement une exception — y compris pour `service_role`, qui
n'est pas soumis à RLS. Objectif : garantir que la seule façon de modifier ou
supprimer une ligne d'audit est une purge délibérée et documentée, jamais une
requête applicative ordinaire ou un bug.

Conséquence directe : une purge de rétention (droit à l'effacement RGPD,
politique de rétention à durée fixe, etc.) ne peut plus se faire par un simple
`DELETE`. Elle doit désactiver le trigger explicitement, purger, puis le
réactiver — en une seule opération documentée (ticket, changelog, ou les deux),
jamais silencieuse.

### Procédure

```sql
ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_immuable;

-- Exemple : purge des logs de plus d'un an.
DELETE FROM public.audit_logs WHERE created_at < now() - interval '1 year';

-- Exemple : purge liée à un droit à l'effacement pour un participant donné.
-- DELETE FROM public.audit_logs WHERE participant_id = '<uuid>';

ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_immuable;
```

À faire systématiquement dans le même changement (migration versionnée ou
script exécuté et archivé) :
- Consigner qui a déclenché la purge, quand, et sur quel périmètre (critère
  de sélection exact du `DELETE`).
- Vérifier après coup que le trigger est bien réactivé
  (`SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_audit_logs_immuable';`
  doit renvoyer `'O'`, pas `'D'`) — l'oubli de réactivation rouvrirait
  silencieusement la faille que ce trigger corrige.
- Ne jamais exécuter la désactivation et la purge comme deux étapes
  manuelles séparées dans le temps : le trigger resterait désactivé entre
  les deux, sans garde-fou.

### Rollback complet du correctif (pas une purge — un revert du trigger lui-même)

```sql
DROP TRIGGER IF EXISTS trg_audit_logs_immuable ON public.audit_logs;
DROP FUNCTION IF EXISTS public.audit_logs_immuable();
```

## Chantiers annexes — outillage et hygiène

Relevés le 2026-08-27 en préparant le lot 8. Aucun n'est bloquant, aucun
n'est traité : listés ici pour ne pas être redécouverts à chaque session.

### `staging-reset-praticien-a-password.ts` écrit dans un dossier orphelin

`scripts/staging-reset-praticien-a-password.ts:31` définit un `OUT_DIR`
**codé en dur** vers le scratchpad d'une session de travail terminée. Le
script y écrit le mot de passe qu'il vient de générer — donc toute
exécution future dépose la seule copie de ce secret dans un dossier
temporaire qui n'a plus de rapport avec la session en cours, et que
personne ne pense à aller lire.

Correctif attendu : passer le chemin de sortie en argument
(`--out <fichier>`), et refuser de tourner si l'argument est absent, plutôt
que de retomber silencieusement sur un chemin mort.

Contexte : c'est ce qui a rendu le harnais inexécutable en local le
2026-08-27. `E2E_PRATICIEN_PASSWORD` dans `.env.test.local` contient une
valeur périmée ; celle qui fonctionne n'existe que dans le shell de
l'opérateur (`$env:E2E_PRATICIEN_PASSWORD`), posée à la main avant chaque
run, exactement comme le décrit `scripts/staging-push-github-secrets.ts`.
Tant que ce fonctionnement reste le bon (décision du 2026-08-27 : ne pas
réinitialiser le mot de passe pour ne pas désynchroniser le secret GitHub
utilisé par la CI), il doit être **documenté** plutôt que redécouvert :
lancer le harnais en local suppose de poser cette variable soi-même.

### `npm run lint` échoue sur le harnais

`tests/security/rls.spec.ts:79` — `PATIENT_B_CODE` est assigné et jamais
utilisé (`@typescript-eslint/no-unused-vars`). Antérieur au lot 8, présent
à l'identique sur `main`. Soit la constante a un usage prévu qui n'a jamais
été écrit, soit c'est un vestige : à trancher en la supprimant ou en
l'utilisant, pas en désactivant la règle.
