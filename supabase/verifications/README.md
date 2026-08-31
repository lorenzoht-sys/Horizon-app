# Vérifications post-migration

Une migration appliquée n'est pas une migration vérifiée. **Le « Success » du
SQL Editor ne prouve rien** — le 2026-08-29, `20260829_roles_02_trigger…` a
affiché un succès sans avoir rien créé, et seule la vérification lancée après
coup l'a révélé (voir `docs/PLAN-BETA.md`).

Ce dossier contient, pour chaque migration qui le mérite, deux fichiers.

| Suffixe | Rôle |
|---|---|
| `.verif.sql` | **Lit un état.** Les objets existent-ils, avec les bons privilèges ? Lecture seule, sans effet. Chaque ligne affiche `OK` ou `### ECHEC ###`. |
| `.contre-epreuve.sql` | **Exerce un comportement.** Provoque l'action attendue et constate qu'elle se produit — ou qu'elle est bien refusée. |
| `.lecture.sql` | **Relit un état sans le juger.** Pour ce qui relève d'une décision et non d'un invariant. Aucun verdict. |

Les deux premiers sont distincts exprès : une migration peut créer tous les
objets et ne pas produire l'effet voulu. La vérification ne le verrait pas.

## N'asserter que des invariants

Un contrôle affirme quelque chose qui doit rester vrai **à jamais**. Un
constat vrai aujourd'hui n'en est pas un.

Le contrôle 6 de `20260829_roles_02_trigger.verif.sql` comptait les comptes
admin et attendait `0` — « aucun à ce stade ». Le 2026-08-31, la création du
premier admin de production l'a fait passer en `### ECHEC ###` alors que rien
n'était cassé. Il affirmait un instantané, pas une propriété.

Il a été reformulé en `roles inattendus (ni admin ni praticien) = 0`, qui est
la propriété réellement garantie par le trigger. Ce qui relève d'une décision
— qui est admin — se relit dans `roles_admins.lecture.sql`, sans verdict.

**Avant d'ajouter un contrôle, demander : qu'est-ce qui le ferait rougir ?**
Si la réponse est « une action normale et prévue », c'est une lecture, pas une
vérification.

## Comment les lancer

**En production** — coller le contenu dans le SQL Editor.

**Sur staging** :

```bash
npx tsx scripts/staging-query.ts   --file supabase/verifications/<fichier>.verif.sql
npx tsx scripts/staging-dry-run.ts --file supabase/verifications/<fichier>.contre-epreuve.sql
```

Toujours `--file` : sous Windows, un SQL multi-ligne passé en argument est
aplati, et un commentaire `--` en tête commente alors tout le reste — la
requête renvoie `[]` sans erreur, ce qui se lit comme « aucune violation ».

**Une seule requête par fichier.** `staging-query.ts` fait
`const { rows } = await client.query(sql)` ; dès qu'un fichier contient
plusieurs instructions, `pg` renvoie un **tableau** de résultats, `rows` vaut
`undefined`, et le script affiche `undefined` — sans erreur, sans indice.
Constaté le 2026-08-31 en ajoutant une seconde requête à un `.verif.sql`.
C'est pourquoi la lecture de la population admin a son propre fichier.

## Deux règles d'écriture

**Les contre-épreuves se terminent par une exception**, volontairement. La
transaction est annulée par construction, donc rien ne peut persister — y
compris un `TRUNCATE` ou un `INSERT` qui réussirait. Le rapport *est* le
message d'erreur : chercher la ligne `CONTRE-EPREUVE`, puis `>>> CONFORME <<<`
ou `>>> NON CONFORME <<<`.

**Jamais de `$$` nu, toujours un délimiteur nommé** (`$verif$`). Le SQL Editor
de Supabase injecte parfois du texte dans le script collé ; avec un
délimiteur nu, l'insertion casse la chaîne de dollar-quoting et une partie du
script est réinterprétée en silence.

## Une contre-épreuve doit avoir été vue rougir

Un contrôle au vert ne prouve rien tant qu'on ne l'a pas vu échouer. Chacune
de celles-ci a été éprouvée dans les deux sens — sur un état sain, et sur un
état défectueux reconstitué dans une transaction annulée. Toute contre-épreuve
ajoutée ici doit l'être aussi.
