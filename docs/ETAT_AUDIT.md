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

## Reste à faire (reporté, pas arbitré)
- **Validation Zod des entrées API** — reste à faire, bloqué par l'absence
  d'environnement de test. Les 12 routes ont une validation manuelle par
  champ (voir `docs/AUDIT_ROUTES_API.md`), mais migrer vers des schémas
  Zod changerait la forme exacte des réponses d'erreur consommées par
  `src/lib/patientApi.ts` et consorts — pas de staging fiable pour vérifier
  l'absence de régression front avant de le faire. Ce n'est pas une
  décision de ne pas faire Zod, c'est un blocage d'environnement.
- **`api/patient/retour-seance.ts`** — **corrigé le 2026-08-19** (F-13,
  `docs/RAPPORT_SECURITE.md`). `seanceId` est désormais vérifié contre
  `participant_id` avant insert, non testé en conditions réelles (pas de
  staging fiable).
- **`api/patient/seance.ts`, `exercices[].id`** — nouveau trou trouvé en
  auditant les identifiants secondaires (voir `docs/AUDIT_ROUTES_API.md`,
  "Constat (deuxième passage)") : `exercice_id` inséré dans
  `exercices_realises` sans vérifier son appartenance au programme du
  participant (la FK ne garantit que l'existence, pas la propriété). Pas
  corrigé, pas encore de finding ouvert dans `docs/RAPPORT_SECURITE.md` —
  décision à prendre.
- **`xlsx` (npm audit)** — **décision prise (2026-08-19) : dette acceptée
  en l'état**, usage 100% client sur les données propres du praticien —
  voir `docs/AUDIT_DEPENDANCE_XLSX.md` pour les conditions de révision.
