#!/usr/bin/env bash
# Répétition à blanc de la migration du schéma (2026-11-11, migration HDS).
#
# Reconstruit la base d'Horizon sur un PostgreSQL STANDARD (sans Supabase), tel
# que le fournira l'add-on Clever Cloud : rôles, schéma `auth` de compatibilité,
# puis toutes les migrations du dépôt, nettoyées. Termine par un jeu FICTIF et
# des contrôles de RLS. Rejouable : c'est le job `repetition-cible` de la CI.
#
# Usage :  PGURI=postgresql://utilisateur@hote:port/base clevercloud/scripts/repetition.sh
# La base visée doit être VIDE et jetable. Le script refuse de continuer si le
# schéma public contient déjà des tables : il ne doit jamais viser une base réelle.
set -euo pipefail

: "${PGURI:?PGURI est obligatoire (base vide et jetable)}"
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
sql() { psql "$PGURI" -X -q -v ON_ERROR_STOP=1 "$@"; }

deja=$(sql -At -c "select count(*) from pg_tables where schemaname = 'public'")
if [ "$deja" != "0" ]; then
  echo "Refus : le schéma public contient déjà $deja table(s). Base vide exigée." >&2
  exit 1
fi

# La production est en PostgreSQL 17 (privilège MAINTAIN, absent avant). Sur une
# version antérieure, utile seulement pour un essai local, ce privilège est retiré.
version=$(sql -At -c "show server_version_num")
if [ "$version" -lt 170000 ]; then
  echo "Attention : PostgreSQL < 17, le privilège MAINTAIN est ignoré (essai local seulement)." >&2
fi

echo "1/5 Rôles anon, authenticated, service_role"
sql <<'SQL'
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
    -- PostgREST se connecte avec l'utilisateur de la base puis fait SET ROLE.
    EXECUTE format('GRANT %I TO CURRENT_USER', r);
  END LOOP;
  ALTER ROLE service_role BYPASSRLS;
END $$;
SQL

echo "2/5 Schéma auth de compatibilité"
sql -v cible=staging -f "$RACINE/clevercloud/sql/01_compat_auth.sql" >/dev/null

echo "3/5 Migrations du dépôt, nettoyées"
n=0
for migration in "$RACINE"/supabase/migrations/*.sql; do
  nom="$(basename "$migration")"
  node "$RACINE/clevercloud/scripts/nettoyer-dump.mjs" "$migration" "$TMP/$nom" "$TMP/$nom.rapport.md" >/dev/null
  if [ "$version" -lt 170000 ]; then sed -i -E 's/,MAINTAIN|MAINTAIN,//g' "$TMP/$nom"; fi
  # check_function_bodies = off : comme pg_restore, les corps sont vérifiés à l'exécution.
  PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning" sql -f "$TMP/$nom" >/dev/null \
    || { echo "Échec sur $nom" >&2; exit 1; }
  n=$((n + 1))
done
echo "    $n migrations appliquées"

# Fonction du trigger de facture neutralisée : sur la cible, le PDF est généré
# par l'application (clevercloud/serveur/repriseFactures.mjs).
sql -v cible=staging -f "$RACINE/clevercloud/sql/03_facture_pdf_sans_pg_net.sql" >/dev/null
echo "    fonction declencher_pdf_facture() neutralisée (pas de pg_net ni de Vault)"

echo "4/5 Jeu fictif et contrôles de RLS"
sql -o /dev/null -f "$RACINE/clevercloud/sql/02_controle_repetition.sql"

echo "5/5 Bilan"
sql -At <<'SQL'
select format('    %s tables, %s avec RLS, %s politiques, %s fonctions, %s triggers',
  (select count(*) from pg_tables where schemaname = 'public'),
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity),
  (select count(*) from pg_policies where schemaname = 'public'),
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal));
SQL
echo "Répétition terminée sans erreur."
