# Plan bêta — points à traiter avant ouverture

## RÈGLE DE MÉTHODE — un contrôle compare un ensemble exact

**Un contrôle qui énumère des cas en oublie un. Comparer un ensemble exact,
jamais tester des cas un par un.**

Cette règle n'est pas théorique : elle a été écrite le 2026-08-29 après
**trois** occurrences du même défaut dans la même journée.

| # | Contrôle | Ce qu'il énumérait | Ce qu'il a manqué |
|---|---|---|---|
| 1 | Privilèges de table de `authenticated` sur `user_roles` | `INSERT`, `UPDATE`, `DELETE` | **`TRUNCATE`** — que la RLS n'intercepte jamais, et qui suffit à vider la table |
| 2 | Bénéficiaires d'`EXECUTE` sur `app_role_courant()` | `PUBLIC` seul | **`anon`**, dont la production porte un grant *nominatif* qu'un `REVOKE FROM PUBLIC` ne retire pas |
| 3 | Contrôle des skips du harnais en CI | — | Il était placé après le contrôle des échecs, qui sort en `exit(1)` : **il n'a jamais pu s'exécuter** |

Les cas 1 et 2 sont le même défaut : une liste de choses interdites, forcément
incomplète. Le cas 3 en est le voisin — un contrôle dont personne n'avait
vérifié qu'il pouvait s'exécuter, ni échouer.

### Comment appliquer la règle

**Pour des privilèges** — lire l'ACL et la comparer à l'ensemble attendu, au
lieu d'appeler `has_table_privilege()` sur une liste. Bénéfice second : ça
évite de nommer `MAINTAIN`, qui n'existe pas avant PostgreSQL 17.

```sql
SELECT string_agg(a.privilege_type, ', ' ORDER BY a.privilege_type)
  INTO privs
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
 WHERE c.oid = 'public.<table>'::regclass
   AND a.grantee = '<role>'::regrole;
IF privs IS DISTINCT FROM '<ensemble attendu>' THEN
  RAISE EXCEPTION 'privileges de <role> = [%], attendu [<ensemble attendu>]', COALESCE(privs, 'aucun');
END IF;
```

Même forme pour les fonctions, en comparant l'ensemble des **bénéficiaires**
d'`EXECUTE` (propriétaire exclu, `grantee = 0` rendu comme `PUBLIC`).

**Pour un inventaire** — comparer dans les **deux sens** : rien d'inattendu en
base, et rien de périmé dans la liste de référence. C'est ce que fait [F-13]
avec `DETTE_PRIVILEGES_AUTHENTICATED` : sans le second sens, la liste pourrit
en silence et le test reste vert sur une réalité qui a changé.

### Corollaire — prouver que le contrôle peut échouer

Un contrôle au vert ne prouve rien tant qu'on ne l'a pas vu rougir. **Casser
délibérément la condition et vérifier le message**, avant de faire confiance
au vert.

C'est ce qui a révélé le cas 2 : l'auto-vérification de la migration
`user_roles` passait au vert avec `anon=EXECUTE`. Lire le code ne l'avait pas
montré ; retirer la ligne `REVOKE ... FROM anon` et rejouer, si.

`scripts/staging-dry-run.ts --file` sert exactement à ça : rejouer un état
défectueux reconstitué dans une transaction toujours annulée.

## ÉCART STRUCTUREL staging / production — privilèges par défaut (2026-08-29)

**Aucune vérification de privilèges (GRANT, `has_table_privilege`, ACL) faite
sur staging ne prouve quoi que ce soit sur la production.** Les deux bases ne
partent pas du même état.

Production porte des règles `ALTER DEFAULT PRIVILEGES` sur le schéma
`public`, que staging n'a pas du tout. Relevé complet du 2026-08-29 :

| `pg_default_acl` sur `public` | production | staging |
|---|---|---|
| tables/vues, règle `postgres` | `postgres`, `authenticated`, `service_role` — tous en `arwdDxtm`. **`anon` absent** | *aucune ligne* |
| séquences, règle `postgres` | `anon` absent | *aucune ligne* |
| fonctions, règle `postgres` | `postgres`, **`anon`**, `authenticated`, `service_role` — tous en `X` (EXECUTE) | *aucune ligne* |
| tables, séquences, fonctions, règle `supabase_admin` | présentes, **`anon` inclus partout** | *aucune ligne* |

Deux lectures distinctes selon le type d'objet :

- **Tables** : `anon` a bien été retiré de la règle `postgres` par
  `20260613_rls_anon_lockdown.sql`. Restent `authenticated` et
  `service_role` — c'est l'objet du chantier planifié plus bas.
- **Fonctions** : `anon` est **toujours là**. `rls_anon_lockdown` a traité
  TABLES et SEQUENCES, jamais FUNCTIONS. Toute nouvelle fonction créée dans
  `public` naît donc `EXECUTE`-able par `anon`, par un grant **nominatif**
  qu'un `REVOKE EXECUTE ... FROM PUBLIC` ne retire pas. C'est la cause
  profonde de la faille de la PR #8 : `get_praticien_structure` et
  `structure_token_valide` ne sont pas devenues ouvertes, elles sont **nées
  ouvertes**.

Conséquence directe : en production, **toute table créée par `postgres` dans
`public` naît avec l'intégralité des privilèges déjà accordée à
`authenticated`** — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
TRIGGER, MAINTAIN. Sur staging, elle naît nue. Le même fichier SQL produit
donc deux états de sécurité différents selon la base.

### Point voisin, clos le 2026-08-29 : `CREATE` sur le schéma `public`

En **production**, `public_a_create`, `anon_a_create` et
`authenticated_a_create` sont tous à `false` : la prod a bien le
comportement PostgreSQL 15+, qui a retiré `CREATE` à `PUBLIC`. **Rien à
faire.**

Sur **staging**, les trois sont à `true` (`nspacl = {postgres=UC/postgres,=UC/postgres}`).
C'est un écart de plus, mais dans le sens inoffensif : staging est plus
permissif que la prod, donc aucune vérification de prod n'est faussée par
lui. Consigné pour mémoire, non bloquant.

### Ce qui l'a révélé

`20260827_roles_01_user_roles.sql` a échoué en production sur sa propre
auto-vérification (« authenticated a un privilege d'ecriture ») — transaction
annulée, table non créée. La même migration était passée au vert sur staging,
où `user_roles` porte exactement `authenticated = SELECT`. Le `GRANT SELECT` de
la migration ne restreignait rien en production : il réaffirmait un privilège
déjà détenu, sans retirer les autres.

Reproduction vérifiée le 2026-08-29 via `scripts/staging-dry-run.ts`, en
rejouant la règle de production dans une transaction annulée : la migration
d'origine échoue avec le message exact de production, la version corrigée
(REVOKE avant GRANT) passe et donne `authenticated = SELECT` dans les deux
environnements.

### Pourquoi le chantier GRANT des 21 et 22 août est passé à côté

`20260821_grant_parity_staging.sql` et `20260822_grant_parity_staging_v2.sql`
attribuaient les 20 tables en écart au « rejeu des migrations qui ne pose que
le GRANT minimal ». La vraie cause était celle-ci, et l'hypothèse avait été
écartée à tort. Le signe qui aurait dû alerter : `20260715_evenements_agenda.sql`
ne contient **aucun** `GRANT`, et pourtant la table avait tous les privilèges en
production et aucun sur staging.

La comparaison des dumps (`supabase/_production_schema_dump.sql` vs
`_staging_schema_dump.sql`) ne pouvait pas le voir : **ces dumps ne contiennent
aucune ligne `ALTER DEFAULT PRIVILEGES`**. Une comparaison de schémas ne couvre
pas les privilèges par défaut ; il faut interroger `pg_default_acl` directement.

### Règle à appliquer tant que l'écart subsiste

Toute migration qui **crée une table dans `public`** doit poser explicitement
ses privilèges, REVOKE d'abord, GRANT ensuite :

```sql
REVOKE ALL ON TABLE public.<table> FROM PUBLIC;
REVOKE ALL ON TABLE public.<table> FROM anon;
REVOKE ALL ON TABLE public.<table> FROM authenticated;
REVOKE ALL ON TABLE public.<table> FROM service_role;

GRANT <ce qui est réellement nécessaire> ON TABLE public.<table> TO <rôle>;
```

L'ordre REVOKE-puis-GRANT rend l'état final identique dans les deux bases,
que la règle par défaut soit présente ou non. Un `GRANT` seul ne suffit pas.

Et une auto-vérification qui contrôle des privilèges doit lire **l'ACL
exacte** (`aclexplode` sur `pg_class.relacl`), jamais une liste de
`has_table_privilege()` : une liste doit énumérer les privilèges interdits et
en oublie — la première version de `user_roles` testait INSERT/UPDATE/DELETE
et laissait passer TRUNCATE, que RLS n'intercepte jamais.

### État de l'exposition aujourd'hui

Les 48 tables de `public` ont toutes RLS activée, et il n'existe aucune vue ni
vue matérialisée dans ce schéma (vérifié le 2026-08-29). Il n'y a donc pas de
table actuellement ouverte en écriture à `authenticated` sans filtre. Le risque
porte sur les **tables futures** : une table créée sans RLS, ou avec une RLS
incomplète, est entièrement ouverte à tout compte connecté sans qu'aucun
`GRANT` n'ait été écrit nulle part. TRUNCATE, en particulier, ignore les
policies : une table protégée par RLS reste vidable en totalité par `authenticated`.

### Garde-fou en place depuis le 2026-08-29

`tests/security/rls.spec.ts` porte deux tests supplémentaires :

- **[F-12]** toute table de `public` a la RLS activée. Vaut pour les deux
  bases : le schéma est le même.
- **[F-13]** `authenticated` ne détient sur `public` que du DML, hors dette
  listée dans `DETTE_PRIVILEGES_AUTHENTICATED` (46 tables au 2026-08-29). Ce
  test ne vaut **que pour staging** — une table créée par une future migration
  naîtra nue sur staging et grande ouverte en production, il ne peut pas le
  voir. Ne pas le lire au vert comme « la production est saine ».

La liste `DETTE_PRIVILEGES_AUTHENTICATED` doit se **vider**, jamais
s'allonger : c'est le décompte du chantier ci-dessous. [F-13] échoue aussi si
une entrée y devient périmée, pour que la dette ne pourrisse pas en silence.

## CHANTIER PLANIFIÉ — retirer la règle de privilèges par défaut

**Décidé sur le principe le 2026-08-29. À faire APRÈS le chantier des rôles,
AVANT l'ouverture bêta.** Pas avant : cette opération change le mode d'échec
de toutes les migrations à venir, elle demande une fenêtre calme.

### Ce qu'il faut faire, exactement

Le chantier a **deux volets**, découverts à deux moments différents. Les
traiter dans la même migration.

**Volet 1 — tables et séquences, pour `authenticated`.**

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
```

**Volet 2 — fonctions, pour `anon`. C'est le trou laissé par
`20260613_rls_anon_lockdown.sql` en juin :** cette migration a traité TABLES
et SEQUENCES, jamais FUNCTIONS. Confirmé en production le 2026-08-29.

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

À traiter avec au moins autant de sérieux que le volet 1 : c'est la cause
profonde de la faille de la PR #8. Sans lui, chaque nouvelle fonction de
`public` naît exécutable par `anon`, et il faut y penser à la main à chaque
fois — exactement ce qui a échoué en juin.

⚠️ **Un `REVOKE EXECUTE ... FROM PUBLIC` ne suffit pas** et ne remplace pas
ce volet : le grant à `anon` est **nominatif**. Vérifié par simulation le
2026-08-29 — une migration à laquelle il ne manquait que le
`REVOKE ... FROM anon` passait au vert avec `anon=EXECUTE`.

**Tant que le volet 2 n'est pas fait**, toute migration créant une fonction
dans `public` doit poser les deux REVOKE, dans cet ordre :

```sql
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM anon;
GRANT  EXECUTE ON FUNCTION public.<fn>() TO <rôles qui en ont besoin>;
```

⚠️ **Jamais sur `service_role`.** Les routes `api/` s'appuient dessus ; le lui
retirer casserait la production immédiatement. Ni sur `postgres`, propriétaire.

### Limite dure : la règle `supabase_admin` est intouchable

Il existe pour chaque type d'objet une **seconde** règle, portée par
`supabase_admin`, qui inclut `anon` partout. Elle ne peut pas être modifiée
depuis le SQL Editor : `postgres` n'est pas superutilisateur
(`rolsuper = false`, vérifié le 2026-08-29) et n'est pas membre de
`supabase_admin`. La tentative renvoie
`permission denied to change default privileges`.

Ce n'est pas bloquant — voir « la règle `supabase_admin` est-elle active ? »
ci-dessous : elle ne s'applique à aucun objet applicatif. Mais il faut le
savoir avant d'écrire la migration, sinon elle échouera.

### La règle `supabase_admin` est-elle active en pratique ?

**Non, pour tout ce qui nous concerne.** `ALTER DEFAULT PRIVILEGES` est scopé
`FOR ROLE` : une règle ne s'applique qu'aux objets créés **par ce rôle**.
Inventaire complet du schéma `public` (staging, 2026-08-29) :

| type d'objet | nombre | propriétaire |
|---|---|---|
| tables | 48 | `postgres` |
| séquences | 5 | `postgres` |
| index | 89 | `postgres` |
| fonctions | 10 | `postgres` |

**Aucun objet de `public` n'appartient à `supabase_admin`.** Le SQL Editor,
les migrations et le Studio créent tous en tant que `postgres` : c'est la
règle `postgres` qui s'applique, et c'est bien elle qu'il faut corriger.

Seule nuance repérée : l'extension `pg_net` est enregistrée avec
`extnamespace = public` et appartient à `supabase_admin`, mais ses objets
vivent en réalité dans le schéma `net`, pas dans `public`. Elle ne déclenche
donc pas la règle sur `public`. Voir toutefois le point ouvert ci-dessous.

Puis, dans la même migration, nettoyer la dette déjà matérialisée sur les
tables existantes — le `ALTER DEFAULT PRIVILEGES` seul n'a **aucun effet
rétroactif** :

```sql
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
```

Et vider `DETTE_PRIVILEGES_AUTHENTICATED` dans `tests/security/rls.spec.ts`
**dans la même PR** — sinon [F-13] échoue sur des entrées périmées, ce qui est
le comportement voulu.

### Pourquoi c'est le bon arbitrage

Garder la règle, c'est risquer une panne **silencieuse** : une table
discrètement ouverte en écriture à tout compte connecté, sans qu'aucun `GRANT`
n'ait été écrit nulle part, donc sans rien à repérer en revue de PR. La
retirer, c'est risquer une panne **bruyante** : `42501 permission denied`,
visible à la première requête. Pour un projet à un seul développeur avant une
bêta, le mode d'échec bruyant vaut nettement mieux.

Le précédent existe déjà dans le dépôt : `20260613_rls_anon_lockdown.sql`
(section 3) a fait exactement cela pour `anon` le 13 juin, et rien n'a cassé.
C'est pourquoi `anon` n'apparaît pas dans la ligne `pg_default_acl` de
production, alors que la configuration Supabase par défaut l'y place.

Bénéfice second : la production rejoint l'état de staging, ce qui **supprime
l'écart structurel** décrit plus haut au lieu de le contourner migration après
migration.

### Ce que ça cassera, et qu'il faut accepter

1. **Toute future migration créant une table sans `GRANT` explicite.** Le style
   `20260715_evenements_agenda.sql` (zéro `GRANT`) donnera une table
   inaccessible : PostgREST répondra `42501`, et les policies ne seront même
   jamais évaluées. C'est précisément le gabarit REVOKE-puis-GRANT ci-dessus
   qui l'évite.
2. **Toute table créée via le Studio Supabase.** Elle naîtra nue.
   `20260620_seances_autonomes.sql` documente déjà un incident de cette
   famille.

Aucune table existante ne sera affectée par le `ALTER DEFAULT PRIVILEGES`
lui-même : il n'agit qu'à la création. Seul le `REVOKE ... ON ALL TABLES`
touche l'existant, et il ne retire que TRUNCATE / REFERENCES / TRIGGER, qu'aucun
code applicatif n'utilise.

### Point ouvert, à instruire séparément : `pg_net` et le schéma `net`

Repéré en passant le 2026-08-29, **hors périmètre bêta**, consigné pour ne
pas le perdre.

Sur staging : `anon` a `USAGE` sur le schéma `net` **et** `EXECUTE` sur
`net.http_post`. Les fonctions de `pg_net` n'ont aucune ACL explicite, donc
l'ACL par défaut de PostgreSQL s'applique : `EXECUTE` à `PUBLIC`. Une
primitive de requête HTTP sortante accessible à un rôle non authentifié,
c'est un SSRF potentiel.

**Ce n'est pas établi comme atteignable.** PostgREST n'expose que les schémas
de sa configuration (`public`, `graphql_public` par défaut chez Supabase) ;
`net` n'en fait normalement pas partie, et un appel REST vers une fonction
d'un schéma non exposé renvoie 404. Je n'ai **pas pu le confirmer depuis la
base** : cette configuration ne vit pas dans Postgres (rien dans
`pg_db_role_setting`), elle est portée par la plateforme.

C'est la configuration Supabase standard, présente dans tout projet. À
instruire pour ce qu'elle est — une vérification de la liste des schémas
exposés, et un contrôle qu'aucune fonction `SECURITY INVOKER` de `public`
n'appelle `net.*` — pas comme une urgence.

### Nuance mesurée le 2026-08-29, à ne pas surestimer

Sur une table à RLS activée sans policy d'écriture, `UPDATE` et `DELETE`
échouent « à vide » (0 ligne, sans erreur) même quand le privilège est
présent : la RLS filtre les lignes. Le privilège excédentaire ne donne donc
**pas** d'accès aux données tant que la RLS est correcte.

Le vrai trou est **TRUNCATE**, que la RLS n'intercepte jamais : vérifié par
contre-épreuve, il réussit sur une table protégée par RLS. Son exploitation
reste toutefois limitée — PostgREST n'expose pas `TRUNCATE`, il faudrait une
connexion Postgres directe ou une fonction `SECURITY INVOKER` mal écrite.
L'argument décisif reste donc la défense en profondeur et le mode d'échec, pas
une faille exploitable aujourd'hui.

## BUG DE PRODUCTION — la réinitialisation de mot de passe ne fonctionne pas (2026-08-29)

**Ce n'est pas un risque futur, c'est une panne actuelle.** Confirmé le
2026-08-29 : aucun SMTP personnalisé n'est configuré sur le projet Supabase de
production (le formulaire est vide, et le dashboard propose d'augmenter la
limite à 30/h *après* activation d'un SMTP personnalisé).

Le service d'email intégré de Supabase n'est pas prévu pour la production :
plafond de quelques envois par heure, et livraison restreinte aux adresses des
membres de l'organisation Supabase.

Conséquence concrète : **si un praticien oublie son mot de passe, il ne reçoit
rien.** `src/pages/ForgotPasswordPage.tsx` appelle `resetPasswordForEmail()`,
l'application affiche un message de succès, et l'email n'arrive jamais. Panne
silencieuse côté utilisateur, invisible côté exploitant. Les tests passés ont
pu réussir : l'adresse utilisée était celle du propriétaire du projet, donc
membre de l'organisation.

### Pourquoi ça bloque aussi l'étape 4

L'onboarding par invitation retenu pour l'étape 4 (`inviteUserByEmail`) passe
par le même mailer. Sans SMTP réel, une invitation envoyée à un vrai praticien
échouerait exactement de la même façon — silencieusement.

**Brancher un SMTP est donc un prérequis de l'étape 4, et un correctif de bug
à part entière, indépendamment de l'étape 4.** Aucune ligne de l'invitation
n'a été écrite tant que ce point n'est pas réglé.

### Vérifier après correction

Lancer une réinitialisation depuis une adresse **non liée** au compte Supabase
(adresse jetable, ou celle d'un tiers). Si le mail arrive, le SMTP est en
place. C'est le seul test qui prouve quelque chose — tester avec sa propre
adresse réussirait même en configuration par défaut.

## LES TESTS UNITAIRES NE TOURNENT PAS EN CI (2026-08-29)

`npm run test:unit` (`vitest run`, qui couvre `api/**/*.test.ts`,
`src/lib/**/*.test.ts`, `src/utils/**/*.test.ts`) **n'est appelé par aucun
workflow**. La CI exécute `build`, `typecheck:api`, `typecheck:e2e`,
`test:e2e`, et `vitest run tests/security` — jamais le reste.

Conséquence constatée le 2026-08-29 : **3 tests de
`api/_lib/patientSession.test.ts` sont en échec** (`accesViaPraticien`,
`TypeError: supabase.rpc is not a function`) et personne ne l'a vu. Ils
échouent aussi sur un arbre propre : ce n'est pas une régression récente.

C'est le même vert silencieux que le workflow `security.yml` combat
explicitement pour le harnais RLS, mais sur l'autre moitié des tests.

### Décision à prendre

Ajouter `npm run test:unit` à la CI **rendra le pipeline rouge immédiatement**,
sur ces 3 échecs préexistants. Deux ordres possibles :

1. Corriger les 3 tests d'abord, ajouter l'étape ensuite — la CI ne passe
   jamais par un état rouge.
2. Ajouter l'étape et inscrire les 3 échecs dans la liste des échecs connus
   ci-dessous, avec une échéance.

L'option 1 est préférable : la liste des échecs acceptés est vide depuis le
2026-08-27, et la réouvrir coûte plus cher que de corriger trois tests.

**En attendant, tout test unitaire ajouté au projet ne s'exécute qu'en local**
— y compris `api/_organisation-admin.test.ts`, ajouté avec l'étape 4.

## SUPPRIMER UN COMPTE PRATICIEN — ce que ça fait vraiment (2026-08-29)

**La règle « jamais de suppression de compte » est juste. Le raisonnement qui
la justifiait était faux, et la réalité est pire que ce qu'il décrivait.**

On croyait : « les FK sont en `ON DELETE CASCADE`, supprimer un praticien
détruirait le dossier patient ». Audit des 21 FK pointant vers `auth.users` :

| Effet réel | Tables |
|---|---|
| **CASCADE** — la ligne est supprimée | `praticiens`, `user_roles`, `indisponibilites`, `evenements_agenda`, `zones_geographiques`, `rappel_preferences`, `programmes_modeles`, `dossier_exercice_membres`, `organisation_membres` |
| **SET NULL** — la ligne SURVIT, orpheline | `participants`, `bilans`, `comptes_rendus_seances`, `notes_seances`, `contrats`, `programmes`, `seances`, `retours_seance`, `exercices_libres_activations`, `tests_etalons_activations`, `organisation_invitations` |

Le dossier patient n'est **pas** en CASCADE. Il est en SET NULL.

### Pourquoi c'est pire qu'une suppression

Toutes les policies de ces tables filtrent sur `praticien_id = auth.uid()`, ou
passent par `acces_participant()` qui retombe sur `participants.praticien_id`.
Avec `praticien_id` à NULL, **aucune de ces conditions ne peut plus être vraie
pour qui que ce soit**. Les lignes existent, aucun compte authentifié ne peut
plus jamais les lire. Seul `service_role` y accède encore.

Une suppression se voit : la donnée a disparu, on le constate. Un orphelinage
ne se voit pas : la base répond « 0 ligne », exactement comme si le praticien
n'avait jamais rien saisi. Pour une obligation de conservation du dossier
patient, c'est le pire des deux — la donnée est légalement conservée et
pratiquement perdue, sans le moindre signal.

### Conséquences

1. **L'interface admin n'expose aucun chemin de suppression.** Pas « masqué »,
   pas « protégé par confirmation » : inexistant. La désactivation se fait par
   bannissement du compte auth (`banned_until`), qui est réversible et ne
   touche à aucune donnée.
2. **Toute suppression déjà faite doit être recherchée.** Un compte supprimé
   par le passé a pu laisser des orphelins invisibles. Requête de contrôle à
   lancer en production :

```sql
SELECT 'participants'           AS t, count(*) FROM public.participants           WHERE praticien_id IS NULL
UNION ALL SELECT 'bilans',                count(*) FROM public.bilans                  WHERE praticien_id IS NULL
UNION ALL SELECT 'comptes_rendus_seances', count(*) FROM public.comptes_rendus_seances WHERE praticien_id IS NULL
UNION ALL SELECT 'notes_seances',          count(*) FROM public.notes_seances           WHERE praticien_id IS NULL
UNION ALL SELECT 'contrats',               count(*) FROM public.contrats                WHERE praticien_id IS NULL
UNION ALL SELECT 'programmes',             count(*) FROM public.programmes              WHERE praticien_id IS NULL
UNION ALL SELECT 'seances',                count(*) FROM public.seances                 WHERE praticien_id IS NULL
ORDER BY 1;
```

   Tout compte non nul désigne des lignes que plus personne ne peut lire. Elles
   sont récupérables (réassignation du `praticien_id` par `service_role`), mais
   encore faut-il savoir qu'elles existent.
3. **À reconsidérer plus tard, hors bêta :** `ON DELETE RESTRICT` sur ces FK
   ferait échouer bruyamment toute suppression de praticien portant un dossier,
   au lieu de l'orpheliner en silence. C'est le bon mode d'échec, mais ça change
   le comportement de la base — pas pendant l'ouverture.

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
               WHERE table_schema='public' AND table_name='structures' AND column_name='expires_at')
UNION ALL SELECT 'user_roles (table)',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='user_roles')
UNION ALL SELECT 'app_role_courant() (fonction)',
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='app_role_courant');
```

⚠️ Cette requête ne contrôle que la **présence** des objets, pas leurs
privilèges. Pour `user_roles`, la présence ne suffit pas : voir la
vérification complète à 9 contrôles et la contre-épreuve, qui sont dans
l'auto-vérification de `20260827_roles_01_user_roles.sql` — elles vérifient
l'ACL exacte, pas seulement que la table existe.

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

### Cette liste est vide depuis le 2026-08-27

**Aucun échec ni skip n'est accepté aujourd'hui.** Toute CI rouge sur ce
harnais est donc une vraie régression, à traiter comme telle — il n'y a plus
de faux positif connu derrière lequel s'abriter.

Comment on y est arrivé, en trois temps le 2026-08-27 :

1. **Le contrôle des skips n'avait jamais pu s'exécuter.** Il était placé
   après celui des échecs, qui sort en `exit(1)` — et un test échouait en
   permanence. L'étape promettait « un skip est un échec, jamais un vert
   silencieux » et ne pouvait pas tenir cette promesse. La logique vit
   désormais dans `scripts/verifier-resultat-harnais.mjs`, qui ne sort plus
   au milieu : il collecte tout, affiche tout, décide à la fin.

2. **Ce qu'il a révélé dans la minute : sept tests ne s'exécutaient pas.**
   Tout le bloc « Findings structurels » (F-05, F-07, F-08, F-09, F-10, plus
   les deux contrôles `[F-01]` du lot 8). Son `beforeAll` ouvrait une
   connexion Postgres directe, qui échouait en `ENETUNREACH` sur les runners
   GitHub — l'hôte n'était joignable qu'en IPv6. Vitest rangeait alors ses
   tests parmi les non exécutés, sans que rien ne le signale. Ces cinq
   findings de sécurité étaient **affirmés, pas prouvés**.

3. **Basculer `STAGING_DATABASE_URL` sur le pooler (IPv4) les a débloqués**,
   et a du même coup rendu possible la migration du test de couverture vers
   la connexion directe (`information_schema` n'est pas exposé par
   PostgREST). Le harnais est passé de 44 tests dont 7 fantômes et 1 échec
   permanent, à 45 tests réellement exécutés.

Tenir cette liste à jour : si un échec devient temporairement acceptable, il
s'inscrit ici avec sa cause et ce qui le débloquerait — et il en repart dans
la PR qui le corrige (comme le lot 4 l'a fait pour `[F-06]` le 2026-08-26).

## RÈGLE — une suite de tests qui écrit dans une base partagée nettoie AVANT, pas après

**Toute suite de tests qui écrit dans une base partagée doit remettre l'état
de départ avant de commencer, et ne jamais compter sur son propre nettoyage
de fin.**

Ce n'est pas un correctif ponctuel, c'est une règle de conception. Un
nettoyage de fin ne s'exécute pas quand le test échoue — or c'est
exactement le moment où il laisse le plus de traces. La suite se retrouve
alors à échouer sur l'état laissé par son propre échec précédent, et plus
aucun run ne peut s'en sortir seul.

### Trois occurrences le même jour (2026-08-27)

Les trois ont le même squelette : le test écrit, échoue, et l'écriture
survit.

1. **`07-seance-coche-exercice`** enregistre la séance du jour du patient de
   démo. Un index unique
   (`seances_patient_no_double_validation_idx`) interdit de la revalider :
   le run suivant recevait un 409 parfaitement légitime. Le test ne pouvait
   passer qu'**une fois par jour et par environnement**. Il est passé au
   vert puis retombé au rouge sans qu'une ligne de code ne change.

2. **`03-creation-bilan`** parcourt un formulaire qui enregistre un
   brouillon au fil des étapes (localStorage **et** Supabase, pour la
   reprise multi-appareils). Un échec en cours de route laisse le brouillon ;
   au run suivant, le modal « reprendre le brouillon ? » bloque les clics, le
   test échoue au même endroit et réenregistre un brouillon. **Panne
   auto-entretenue** : trois runs consécutifs, et la purge des bilans
   accumulés n'y changeait rien — ce qui a d'abord fait suspecter, à tort,
   l'accumulation.

3. **Accumulation silencieuse.** `03` ajoute un bilan trimestriel à chaque
   passage réussi (13 bilans, `trimestre` jusqu'à 13), `02` ajoute un
   participant à chaque passage. Aucun des deux ne fait échouer quoi que ce
   soit tout de suite — l'état du jeu de démo dérive simplement, run après
   run, jusqu'à ce qu'un test s'y casse pour une raison qui n'a plus l'air
   d'avoir de rapport.

### Ce qu'on en fait

`scripts/staging-reset-etat-e2e.ts`, appelé par le job `e2e` **avant**
Playwright, remet le jeu de démo dans son état de départ. Toute écriture
nouvelle introduite par un test doit y être ajoutée dans la même PR.

Le corollaire vaut aussi pour les tests eux-mêmes : un test qui a besoin
d'une donnée doit vérifier qu'elle est là (`expect(...).toBeGreaterThan(0)`)
plutôt que de boucler sur une liste éventuellement vide — sinon il passe au
vert sans rien vérifier, ce qui est pire qu'un échec.

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

### Deux scripts écrivent dans un dossier orphelin

`scripts/staging-reset-praticien-a-password.ts:31` définit un `OUT_DIR`
**codé en dur** vers le scratchpad d'une session de travail terminée. Le
script y écrit le mot de passe qu'il vient de générer — donc toute
exécution future dépose la seule copie de ce secret dans un dossier
temporaire qui n'a plus de rapport avec la session en cours, et que
personne ne pense à aller lire.

`scripts/staging-backup.ts` a exactement le même défaut, constaté le
2026-08-27 : la sauvegarde prise avant un reseed est partie dans ce même
dossier d'une session terminée. Moins grave (ce n'est pas un secret, et le
script affiche le chemin), mais une sauvegarde qu'on ne retrouve pas ne
protège de rien.

Correctif attendu pour les deux : passer le chemin de sortie en argument
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

### `STAGING_DATABASE_URL` est sur le pooler en mode *transaction*, pas *session*

Depuis le 2026-08-27, la chaîne pointe sur
`aws-0-eu-west-3.pooler.supabase.com:**6543**`. Le port 6543 est le pooler en
mode **transaction** ; le mode **session** est sur le **5432**.

Ça fonctionne aujourd'hui, et c'est ce qui a débloqué les sept tests
structurels en CI. Deux conséquences à connaître avant d'écrire un nouveau
test qui passerait par cette connexion :

- **Aucun état de session ne persiste d'une requête à l'autre.** Le
  `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` du `beforeAll` de
  `tests/security/rls.spec.ts` est accepté mais sans effet durable : le
  harnais ne tourne pas réellement en lecture seule, il s'y tient par
  discipline (il ne fait que des `SELECT`). Sans conséquence tant que
  personne n'y ajoute une écriture par mégarde.
- **Les fonctionnalités liées à la session sont indisponibles** : verrous
  consultatifs, `LISTEN`/`NOTIFY`, `SET` persistant, curseurs `WITH HOLD`.
  Un test qui en aurait besoin devra passer par le 5432.

À basculer sur le mode session (5432) au prochain passage dans le dashboard
Supabase — décision de Lorenzo, sans urgence.

### Les `code_acces` sont tirés avec `Math.random()`

`src/utils/codeAcces.ts` tire 8 caractères dans un alphabet de 31 symboles
avec `Math.random()`. L'espace est large — 31⁸ ≈ 8,5 × 10¹¹, soit une
chance sur ~3,5 × 10¹⁰ de tomber sur l'un des 24 codes de production par
tirage aveugle — mais **`Math.random()` n'est pas cryptographique**. C'est
un xorshift128+ dans V8 : qui observe assez de sorties du même contexte
peut reconstituer l'état interne et prédire les suivantes.

Ce que ça veut dire concrètement : un code d'accès **est** un justificatif
d'authentification (il ouvre le dossier de santé du bénéficiaire, en
écriture). Il devrait être tiré comme tel. Le correctif tient en une ligne —
`crypto.getRandomValues()` à la place de `Math.random()`, même alphabet,
même longueur, aucun changement visible.

Nuance sur l'exploitabilité, pour ne pas surestimer : la génération a lieu
dans le navigateur du praticien, au moment où il crée une fiche. Un
attaquant devrait donc observer des codes issus de la même session de
navigation pour prédire les suivants — ce qui suppose déjà un accès à ces
codes. Faiblesse réelle, pas trou béant.

À noter : `scripts/regenerer-codes-acces-structure.ts` utilise déjà
`crypto.randomInt()`. Les codes régénérés sont donc plus solides que ceux
créés par l'application au quotidien — incohérence à résorber en traitant
ce point.

### Le rate limit patient est par IP seulement, et l'IP est déclarative

`api/_lib/patientAuth.ts` : 5 tentatives / 15 min, comptées **par IP**
(`patient_login_attempts`). Ni par code, ni globalement. Deux limites :

1. **Aucun plafond global.** Un attaquant disposant de N adresses obtient
   5N tentatives par quart d'heure. Avec un botnet de 10 000 IP, on atteint
   l'ordre de grandeur d'un succès par an sur les 24 codes actuels — pas un
   risque immédiat, mais une propriété qui se dégrade à mesure que le nombre
   de bénéficiaires augmente, puisque la cible grossit.
2. **L'IP est prise dans `x-forwarded-for`**, premier élément
   (`getClientIp`, ligne 52). Si la plateforme laisse passer un en-tête
   fourni par le client, le compteur se contourne en changeant une chaîne
   de caractères — et le rate limit ne protège plus rien. **Non vérifié** :
   ça se teste en une requête contre le Preview, avec un
   `x-forwarded-for` arbitraire, en regardant quelle valeur atterrit dans
   `patient_login_attempts.ip`. À faire avant de conclure quoi que ce soit.

Pistes, si le point 2 se confirme : compter aussi par code d'accès
(indépendamment de l'IP), et prendre l'IP depuis un en-tête que la
plateforme garantit plutôt que depuis le premier élément d'un en-tête que
n'importe qui peut écrire.

### `npm run lint` échoue sur le harnais

`tests/security/rls.spec.ts:79` — `PATIENT_B_CODE` est assigné et jamais
utilisé (`@typescript-eslint/no-unused-vars`). Antérieur au lot 8, présent
à l'identique sur `main`. Soit la constante a un usage prévu qui n'a jamais
été écrit, soit c'est un vestige : à trancher en la supprimant ou en
l'utilisant, pas en désactivant la règle.
