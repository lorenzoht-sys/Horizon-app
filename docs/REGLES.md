# Règles de travail durables

Extraites telles quelles de l'ancien `docs/archive/PLAN-BETA.md` le 2026-11-17
(nettoyage, lot 3). Ce fichier mêlait ces règles, toujours valables, à un
journal de chantiers clos de l'été 2026, archivé dans
`docs/archive/PLAN-BETA.md`. Les dates et numéros de PR cités ci-dessous
renvoient à ce journal.

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

## RÈGLE — jamais de suivi des clics sur les emails d'authentification

**Le suivi des clics d'un routeur d'emails (Brevo, Resend, Mailchimp, SendGrid…)
détruit tout lien d'authentification Supabase. Ce n'est pas un réglage à
ajuster : c'est une incompatibilité de principe.**

### Pourquoi c'est structurel, et pas un bug à contourner

Supabase renvoie le jeton dans le **fragment** de l'URL :

```
https://app.horizon-suivi.fr/reset-password#access_token=…&type=recovery
```

Tout ce qui suit le `#` n'est **jamais transmis au serveur** — c'est le
fonctionnement du Web, pas une particularité de Supabase. Le fragment n'existe
que dans le navigateur.

Le suivi des clics réécrit le lien vers un domaine de traçage
(`r.mail.horizon-suivi.fr/tr/cl/…`) qui enregistre le clic puis renvoie une
redirection HTTP vers la destination. Ce serveur n'a jamais vu le fragment :
il ne peut donc pas le réémettre. **Le jeton disparaît entre le clic et
l'arrivée.**

Aucune configuration ne répare ça. Ni la liste des Redirect URLs, ni le
template. La seule issue est de désactiver le suivi des clics sur les emails
transactionnels.

Depuis le passage à Resend (voir la mise à jour en tête de la section du bug du 2026-08-29), la règle
vaut à l'identique : le suivi des clics de Resend doit rester **désactivé** pour le domaine
`horizon-suivi.fr`, e-mails de connexion comme envoi des factures.

### Pourquoi ça a coûté cher à diagnostiquer (2026-08-29)

La panne est silencieuse de bout en bout :

- Brevo signale l'email **délivré**, et le clic **enregistré** ;
- le navigateur arrive bien sur le bon domaine ;
- l'application affiche la page de connexion, sans erreur ;
- aucune trace nulle part.

Trois hypothèses avaient été formulées — page manquante, Redirect URLs, lien
expiré — et **aucune n'était la bonne**. C'est l'URL d'atterrissage réelle,
relevée dans la barre d'adresse, qui a tranché : elle pointait sur le domaine
de traçage.

**Leçon de méthode : devant un flux de redirection qui échoue, relever l'URL
réellement atteinte avant de raisonner sur la configuration.** Les hypothèses
se testent en une seconde avec la donnée, et se discutent une heure sans elle.

### Portée

Vaut pour **tous** les emails d'authentification, pas seulement la
réinitialisation : invitation (`admin.inviter`), lien magique, confirmation
d'adresse. Tous portent leur jeton dans le fragment.

À revérifier à chaque changement de routeur d'emails, et après toute
modification des réglages d'un routeur existant — le suivi des clics est
souvent activé par défaut, et par compte plutôt que par email.

### Test de non-régression

Cliquer sur un lien de réinitialisation et vérifier que l'URL atteinte
contient bien `#access_token=…`. Si elle passe par un domaine tiers, le suivi
est réactivé.

## RÈGLE — un « Success » du SQL Editor ne prouve PAS qu'une migration est appliquée

**Seule une vérification séparée, lancée après coup, prouve qu'une migration a
pris. Le message de succès de l'éditeur ne prouve rien.**

### Ce qui a rendu cette règle nécessaire (2026-08-29)

`20260829_roles_02_trigger_role_par_defaut.sql` a été appliquée en production.
Le SQL Editor a affiché **« Success »**. La vérification en 6 contrôles,
lancée juste après, a trouvé :

- trigger `trg_auth_users_role_par_defaut` **absent**
- fonction `attribuer_role_par_defaut()` **absente**
- contre-épreuve **NON CONFORME** — le rôle n'était pas attribué

La migration a été réappliquée, et la seconde fois a été la bonne (6/6 OK,
contre-épreuve CONFORME).

Sans cette vérification, du code applicatif supposant que tout compte possède
un rôle aurait été mergé sur une base où le trigger n'existait pas. La panne
serait apparue en production, sur des comptes créés après le merge, sans
rapport apparent avec la migration.

### Ce que ça implique concrètement

La séquence n'est pas « appliquer, lire le message vert, passer à la suite ».
Elle est :

1. **Appliquer** la migration.
2. **Vérifier** par une requête séparée que les objets attendus existent, avec
   les bons privilèges — sans jamais se fier au retour de l'éditeur.
3. **Contre-éprouver** : provoquer le comportement attendu et constater qu'il
   se produit (et qu'il ne se produit PAS quand la migration est absente).

Les étapes 2 et 3 sont distinctes exprès. La vérification lit un état, la
contre-épreuve exerce un comportement — une migration peut créer tous les
objets et ne pas produire l'effet voulu. C'est la contre-épreuve qui a rendu
l'échec lisible ici, en une ligne : `NON CONFORME`.

L'auto-vérification embarquée dans la migration (le bloc `DO` qui lève une
exception) ne remplace pas ces deux étapes : si la migration n'a pas été
exécutée du tout, son auto-vérification ne l'a pas été non plus.

## RÈGLE — jamais de `$$` nu dans du SQL collé dans le SQL Editor

**Toujours un délimiteur nommé : `$verif$`, `$fn$`, `$trg$`. Jamais `$$`.**

### Pourquoi

Constaté le 2026-08-29 : le SQL Editor de Supabase **injecte parfois du texte
dans le script collé** — en l'occurrence un `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY` inséré au milieu d'un bloc `DO $$ ... $$`.

Avec un délimiteur nu, l'insertion **casse la chaîne de dollar-quoting** : le
`$$` d'ouverture se referme au mauvais endroit, et le reste du script est
réinterprété comme du SQL ordinaire. Selon l'endroit de la coupure, le script
peut échouer bruyamment… ou n'exécuter qu'une partie de lui-même en signalant
un succès. C'est le mécanisme le plus plausible derrière le « Success » sans
effet décrit à la section précédente.

Un délimiteur nommé rend l'accident beaucoup moins probable (`$verif$` ne
risque pas de coïncider avec un fragment injecté) et, s'il survient quand
même, l'erreur est franche au lieu d'être silencieuse.

```sql
-- FRAGILE
DO $$ BEGIN ... END $$;

-- ROBUSTE
DO $verif$ BEGIN ... END $verif$;
```

Vaut pour les blocs `DO`, les corps de fonction (`AS $fn$ ... $fn$`) et toute
chaîne dollar-quotée.

### Dette existante

**10 migrations du dépôt utilisent encore `DO $$` nu**, dont
`20260827_roles_01_user_roles.sql` et
`20260829_roles_02_trigger_role_par_defaut.sql`.

Elles ne sont **pas** réécrites rétroactivement : leur contenu a été appliqué
en production et l'empreinte MD5 de ces deux fichiers a servi de contrôle
d'intégrité avant application. Les modifier ferait diverger le fichier de ce
qui a réellement été exécuté, et coûterait la traçabilité qu'on vient de
gagner.

Le risque résiduel est le rejeu : ces migrations sont idempotentes et donc
rejouables, et un rejeu passerait par le SQL Editor. À durcir avant tout
rejeu, ou lors d'une reprise de ces fichiers pour une autre raison.

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
               WHERE n.nspname='public' AND p.proname='app_role_courant')
UNION ALL SELECT 'trg_participants_consentement_rgpd_creation (trigger)',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid='public.participants'::regclass
                 AND tgname='trg_participants_consentement_rgpd_creation' AND NOT tgisinternal);
```

⚠️ Exception à l'ordre ci-dessus pour `20260913_rgpd_consentement_creation.sql` :
elle s'applique **après** le déploiement du code, voir la section « RÈGLE —
consentement RGPD obligatoire à la création » plus bas.

⚠️ Même exception pour `20260914_retrait_visibilite_progression.sql` (PR #46) :
elle retire une clé que le nouveau code ne lit plus. Appliquée en production
après le merge et le déploiement, vérifiée (voir le point de reprise en tête
de fichier). Une exception se justifie migration par migration, jamais par
défaut : `20260914_apley_scratch_test_bilans.sql` (PR #50) suit l'ordre
normal, parce que le code écrit la nouvelle colonne.

⚠️ Cette requête ne contrôle que la **présence** des objets, pas leurs
privilèges. Pour `user_roles`, la présence ne suffit pas : voir la
vérification complète à 9 contrôles et la contre-épreuve, qui sont dans
l'auto-vérification de `20260827_roles_01_user_roles.sql` — elles vérifient
l'ACL exacte, pas seulement que la table existe.

Tant qu'aucun garde-fou automatique n'existe (rien dans la CI ne compare le
schéma de production aux migrations du dépôt), cette vérification est
manuelle et fait partie de la revue de toute PR touchant `supabase/migrations/`.

Et elle se fait **après** l'application, jamais à la place : voir « un
« Success » du SQL Editor ne prouve PAS qu'une migration est appliquée »
ci-dessus. Une migration peut afficher un succès sans avoir rien créé.

## RÈGLE — consentement RGPD obligatoire à la création d'un bénéficiaire

**Aucune fiche ne se crée sans `rgpd.consentementObtenu = true`, quel que soit
le chemin. Une fiche existante sans consentement reste modifiable.**

### Ce qui a rendu cette règle nécessaire (2026-09-13)

7 fiches de production sans consentement, toutes avec un objet `rgpd` complet
à `false`, `methodeConsentement: "oral_note"` et `consentementDate` égale au
jour de création : l'état initial du formulaire complet, enregistré sans que
rien ne soit coché. Le formulaire affichait un avertissement et ne bloquait
rien. Le formulaire mobile et l'import Excel n'écrivaient même pas `rgpd`.

### Où la règle est appliquée

| Chemin | Blocage |
|---|---|
| Formulaire complet (création) | `submit()` renvoie à l'étape 5 avec un message |
| Formulaire mobile | même règle, même module |
| Import Excel | colonne R « Consentement RGPD » : toute ligne sans « Oui » est refusée et listée |
| Base de données | trigger `BEFORE INSERT` (`20260913_rgpd_consentement_creation.sql`) |

Règles partagées : `src/lib/consentementRgpd.ts` (testé).

**Pas de contrainte `CHECK … NOT VALID`** : `NOT VALID` n'épargne que la
vérification initiale ; la contrainte est ensuite contrôlée à chaque UPDATE,
ce qui aurait bloqué toute modification des fiches sans consentement
(géocodage et archivage compris).

### Ordre d'application : APRÈS le déploiement du code

Inverse de la règle « migration en production AVANT le merge », parce que la
dépendance est inversée : le nouveau code marche avec ou sans trigger, mais le
trigger appliqué sous l'ancien code rejetterait toutes les créations mobiles et
Excel (`rgpd = null`) en production.

1. Merger, attendre la fin du déploiement de production.
2. Appliquer en production, puis les deux requêtes ci-dessous.
3. Appliquer sur staging, relancer le harnais.

### Vérification (requête séparée, lecture seule)

```sql
SELECT
  (SELECT tgtype FROM pg_trigger
    WHERE tgrelid = 'public.participants'::regclass
      AND tgname = 'trg_participants_consentement_rgpd_creation'
      AND NOT tgisinternal) AS tgtype_attendu_7,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'public' AND p.proname = 'exiger_consentement_rgpd_creation'
      AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner) AS roles_execute_attendu_0;
```

Attendu : `7` (BEFORE INSERT FOR EACH ROW, ni UPDATE ni DELETE) et `0`.

### Contre-épreuve (n'écrit rien)

Le bloc se termine par une exception **volontaire** qui annule tout. Le
résultat attendu est donc une erreur dont le message commence par
`CONFORME`. Tout message `NON CONFORME` est un échec.

```sql
DO $contre$
DECLARE v_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.participants (nom, prenom) VALUES ('ContreEpreuve', 'SansRgpd');
    RAISE EXCEPTION 'NON CONFORME (1/4) : creation avec rgpd = null acceptee';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd)
    VALUES ('ContreEpreuve', 'RgpdFalse', '{"consentementObtenu": false}'::jsonb);
    RAISE EXCEPTION 'NON CONFORME (2/4) : creation avec consentementObtenu = false acceptee';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.participants (nom, prenom, rgpd)
    VALUES ('ContreEpreuve', 'AvecRgpd', '{"consentementObtenu": true}'::jsonb)
    RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'NON CONFORME (3/4) : creation avec consentement refusee';
  END;

  BEGIN
    UPDATE public.participants SET rgpd = NULL WHERE id = v_id;
    UPDATE public.participants SET telephone = '0000000000' WHERE id = v_id;
    INSERT INTO public.participants (id, nom, prenom, rgpd)
    VALUES (v_id, 'ContreEpreuve', 'Upsert', NULL)
    ON CONFLICT (id) DO UPDATE SET prenom = EXCLUDED.prenom;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'NON CONFORME (4/4) : modification d''une fiche sans consentement refusee';
  END;

  RAISE EXCEPTION 'CONFORME (4/4) — exception volontaire : rien n''a ete ecrit';
END
$contre$;
```

Sur staging, `staging-query.ts` ouvre une transaction **en lecture seule** :
les INSERT de la contre-épreuve y échoueraient pour une autre raison, et le
message ne serait jamais `CONFORME`. Il faut une transaction en écriture,
annulée à la fin (`BEGIN` … `ROLLBACK`).

### État au 2026-09-14

- Code en production (PR #44, `9f781b4`).
- Migration appliquée et vérifiée en **production** puis sur **staging**
  (résultats dans le point de reprise en tête de fichier).
- Les `consentementDate` trompeuses des 7 fiches sont effacées ; leur
  consentement reste à régulariser à la main.
- **Non prouvé** : l'e2e 02 (blocage de création) et le harnais praticien
  avec trigger actif — voir le point de reprise.

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

**Le cas `02` a mis douze jours à recevoir son bloc.** La règle ci-dessus le
nommait dès le 2026-08-27 (« `02` ajoute un participant à chaque passage »),
mais seuls les deux autres cas ont reçu leur bloc dans le script. Entre-temps,
49 fiches `Test E2E<timestamp>` se sont accumulées sur staging, du 2026-08-26
au 2026-09-06, chacune portant un `code_acces` actif. Bloc 4 ajouté et
exécuté le 2026-09-08 : 49 supprimées, les deux participants de démo intacts.

Ce n'était pas une panne — `supprimer()` lève sur erreur HTTP, rien
n'échouait en silence. C'était un **trou de couverture** : écrire la règle et
nommer le cas ne suffit pas, tant que le bloc n'est pas dans le script. La
phrase ci-dessus (« doit y être ajoutée dans la même PR ») est la seule chose
qui l'empêche de se reproduire ; elle n'a pas été suivie.

Le corollaire vaut aussi pour les tests eux-mêmes : un test qui a besoin
d'une donnée doit vérifier qu'elle est là (`expect(...).toBeGreaterThan(0)`)
plutôt que de boucler sur une liste éventuellement vide — sinon il passe au
vert sans rien vérifier, ce qui est pire qu'un échec.

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
