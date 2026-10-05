# Migrations Supabase

Procédure complète : **`docs/SCHEMA.md`** (règle, création, test, application,
recréation d'une base locale).

À retenir :

- Tout changement de schéma passe par un fichier ici, jamais par Supabase
  Studio ni par le SQL Editor.
- Nom : `AAAAMMJJHHMMSS_description.sql` (14 chiffres, préfixe unique).
- `20260528000000_baseline_schema_prod.sql` est la reconstitution exacte de la
  production au 2026-10-05 : elle ne se rejoue jamais en production (elle y est
  marquée « appliquée », voir `docs/SCHEMA.md` §4).
- Les 98 migrations antérieures sont dans `../migrations_archive/` (historique
  uniquement, ne plus les exécuter).
- Aucune migration n'est appliquée à staging ou à la production sans l'accord
  explicite de Lorenzo.
