# Actions réservées à Lorenzo — audit sécurité

Tout ce qui suit nécessite un accès base (staging ou prod) ou une décision
produit. Claude ne l'a pas fait et ne doit pas le faire seul — voir
`docs/RAPPORT_SECURITE.md` (détail par finding) et `docs/ETAT_AUDIT.md`
(état général, blocage staging).

## 1. Débloquer la connexion Postgres directe (prérequis à tout le reste)

`DATABASE_URL` vers prod échouait (`ENOTFOUND base`) — probablement
guillemets doubles PowerShell (interpolation `$`) ou caractère réservé non
encodé dans le mot de passe. Guillemets simples + encodage si besoin (voir
historique de session). Sans ça : pas de diff de schéma, pas de
`scripts/dump-schema.ts` côté prod.

## 2. Diff de schéma prod ↔ staging (abandonné pour cette session)

```powershell
cd "chemin\vers\mouvtrack"
$env:DATABASE_URL = 'ta-connexion-prod'
$env:DUMP_OUTPUT_LABEL = 'prod'
npx tsx scripts/dump-schema.ts
```
Puis la même chose côté staging avec `STAGING_DATABASE_URL`. Une fois les
deux fichiers écrits (`supabase/_prod_schema_dump.sql`,
`supabase/_staging_schema_dump.sql`, déjà gitignorés), demande à Claude de
produire `docs/DIFF_SCHEMA_PROD_STAGING.md` et le script de rattrapage
staging.

## 3. Appliquer les migrations de sécurité (staging D'ABORD, jamais prod directement)

Aucune n'a été appliquée nulle part à ce jour. À rejouer dans l'ordre, sur
**staging seulement**, puis valider avant d'envisager prod :

| Fichier | Ferme | Statut code |
|---|---|---|
| `20260817_securite_01_tm6_variantes_rls.sql` | F-01, F-09 | Réécrit 2026-08-19, plus l'avertissement "ne pas appliquer" |
| `20260817_securite_02_ghost_policies_programmes.sql` | F-05 | Inchangé |
| `20260817_securite_03_audit_logs_immuable.sql` | F-06 | Inchangé |
| `20260817_securite_04_evenements_agenda_with_check.sql` | F-07 | Inchangé |
| `20260817_securite_05_search_path_set_praticien_id.sql` | F-08 | Inchangé |
| `20260817_securite_06_ghost_policy_documents_partages.sql` | F-10 | Inchangé |
| `20260817_securite_07_revoke_get_praticien_structure.sql` | F-11 | Inchangé |
| `20260817_securite_08_rate_limit_claude.sql` | Phase 2 (hors F-01..F-11) | Inchangé |
| `20260819_structure_token_expiration.sql` | F-04 | Nouveau, 2026-08-19 |

Après chaque application sur staging : relancer le test correspondant dans
`tests/security/rls.spec.ts` (`-t "F-XX"`) pour un vrai rouge→vert, pas
juste "ça a tourné sans erreur SQL".

## 4. Vérifier le modèle GRANT sur les autres tables (soulevé par F-01)

`tm6_variantes` avait `GRANT ALL` (y compris `TRUNCATE`) pour `authenticated`
en prod — RLS seule ne protège jamais contre `TRUNCATE`. Requête pour
vérifier si c'est le cas ailleurs (lecture seule, prod) :
```sql
select c.relname as table_name, acl.grantee::regrole::text as grantee, acl.privilege_type
from pg_class c
cross join lateral aclexplode(c.relacl) as acl
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and acl.grantee::regrole::text in ('anon','authenticated','service_role')
order by table_name, grantee, privilege_type;
```
Si `TRUNCATE` apparaît pour `authenticated` sur une table de donnée
patient, c'est un nouveau finding à ouvrir (plus grave que sur un
catalogue de référence).

## 5. Décisions produit non tranchées

- **F-12 (rate limit Claude)** : seuil relevé à 60/h à dire d'expert (usage
  plausible), jamais mesuré sur de l'usage réel. À revoir si ça s'avère
  encore trop juste, ou si un praticien se plaint de blocages.
- **Migration Zod** : pas faite (changerait la forme des réponses d'erreur
  sans environnement pour vérifier la non-régression front). À planifier
  avec un vrai staging fonctionnel.

## 6. Une fois staging fiable

Reprendre le harnais `tests/security/rls.spec.ts` finding par finding
(F-01 puis F-05 à F-11), un test à la fois, résultat brut à chaque fois —
pas de passage en lot tant qu'un rouge→vert individuel n'est pas confirmé.

## 7. Sécurité / configuration externe (reporté d'une session antérieure)

- [ ] **Vérifier la région du projet Sentry (US vs EU)** — donnée de santé
  qui transiterait par des serveurs hors UE sans base légale documentée
  est un point de conformité RGPD, pas seulement technique. Ce n'est pas
  visible depuis le code (`src/lib/sentry.ts` / `api/_lib/sentry.ts`),
  c'est un réglage du dashboard Sentry (Organization Settings > Region,
  au moment de la création du projet). Si le projet est en région US et
  que Sentry est activé en production (voir `docs/SENTRY.md`), il faut
  soit migrer vers un projet EU, soit documenter la base légale du
  transfert.
