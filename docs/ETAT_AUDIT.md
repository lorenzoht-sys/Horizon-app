# État de l'audit sécurité — pour reprise

**2026-08-19, fin de session.** Phase 1 (analyse) terminée. Le harnais
`tests/security/rls.spec.ts` n'est **pas opérationnel** — aucun correctif
n'est validé par un test qui passe pour la bonne raison.

## Blocage exact
Staging (`nnfkchhtjrferxnwlcxp`) ne reproduit pas l'état vulnérable réel de
prod (vérifié : `tm6_variantes` a RLS activée + 4 policies permissives en
prod, RLS activée + 0 policy sur staging — un vert du harnais n'y prouve
rien). Le diff de schéma complet prod ↔ staging, seule façon fiable de
combler l'écart, n'a pas pu être fait : la connexion Postgres directe
(`DATABASE_URL` vers prod) échoue côté utilisateur (`ENOTFOUND base`,
probablement chaîne de connexion corrompue — piste donnée, pas résolue).

## Règle absolue
**Aucun merge de `audit-securite-global` vers `main`. Aucune migration
`20260817_securite_*` appliquée en prod.** Confirmé ce jour : la branche
n'est ancêtre d'aucun commit de `main` et n'existe pas sur `origin`.

## Prochaine action concrète
Résoudre la connexion Postgres directe vers prod (chaîne encodée, guillemets
simples PowerShell — voir historique de session), lancer
`scripts/dump-schema.ts` des deux côtés, produire
`docs/DIFF_SCHEMA_PROD_STAGING.md` — avant de rouvrir le harnais.
