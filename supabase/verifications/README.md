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

Les deux sont distincts exprès : une migration peut créer tous les objets et
ne pas produire l'effet voulu. La vérification ne le verrait pas.

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
