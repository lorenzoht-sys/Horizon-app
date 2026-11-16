#!/usr/bin/env bash
# Comparaison de la base Supabase et de la base Clever Cloud après transfert
# (2026-11-16, migration HDS). Répond à la ligne « comptes de lignes
# identiques, table par table » de la liste de vérification avant bascule, et
# va plus loin : pour chaque table du schéma public, le nombre de lignes ET
# une empreinte du contenu (somme des empreintes de chaque ligne, donc
# indépendante de l'ordre). Compare aussi auth.users (identifiant et e-mail),
# la position des séquences, et le nombre de politiques RLS, de triggers et de
# fonctions.
#
# Ne lit que : aucune écriture, ni à la source ni à la cible. N'affiche aucune
# donnée : seulement des noms de tables et des nombres.
#
# Sur la cible, la lecture se fait sous le rôle service_role : l'utilisateur de
# l'add-on est propriétaire des tables mais reste soumis à la RLS forcée
# (claude_rate_limit), qu'il verrait vide.
#
# Usage : SOURCE_URI=… CIBLE_URI=… clevercloud/scripts/comparer-bases.sh
# Code de sortie : 0 si tout est identique, 1 sinon.
set -euo pipefail

: "${SOURCE_URI:?SOURCE_URI est obligatoire}"
: "${CIBLE_URI:?CIBLE_URI est obligatoire}"
umask 077
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Même représentation texte des deux côtés, quel que soit le réglage du serveur.
REGLAGES="-c default_transaction_read_only=on -c timezone=UTC -c datestyle=ISO,YMD -c intervalstyle=postgres -c extra_float_digits=1 -c bytea_output=hex"

releve() { # $1 = adresse, $2 = rôle à endosser (vide = aucun)
  PGOPTIONS="$REGLAGES" psql "$1" -X -q -At -F ' ' -v ON_ERROR_STOP=1 -v role="$2" <<'SQL'
\if :{?role}
\else
  \set role ''
\endif
select :'role' <> '' as endosser \gset
\if :endosser
  set role :"role";
\endif
-- Une requête par table, générée puis exécutée (\gexec).
select format(
  'select %L, count(*), coalesce(sum(hashtextextended(t::text, 0)), 0) from public.%I t',
  'table ' || tablename, tablename)
from pg_tables where schemaname = 'public' order by tablename
\gexec
select 'table auth.users', count(*), coalesce(sum(hashtextextended(id::text || '|' || coalesce(email, ''), 0)), 0) from auth.users;
reset role;
select 'sequence ' || sequencename, coalesce(last_value, 0), 0 from pg_sequences where schemaname = 'public' order by sequencename;
select 'politiques RLS', count(*), 0 from pg_policies where schemaname = 'public' and policyname <> 'service_role_acces_serveur';
select 'triggers', count(*), 0 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal;
select 'fonctions', count(*), 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
select 'tables sans RLS', count(*), 0 from pg_tables where schemaname = 'public' and not rowsecurity;
SQL
}

releve "$SOURCE_URI" "" > "$TMP/source.txt"
releve "$CIBLE_URI" "service_role" > "$TMP/cible.txt"

tables=$(grep -c '^table ' "$TMP/source.txt" || true) # auth.users comprise
lignes=$(awk '$1 == "table" { n += $(NF-1) } END { print n + 0 }' "$TMP/source.txt")
if diff "$TMP/source.txt" "$TMP/cible.txt" > "$TMP/ecarts.txt"; then
  echo "    identiques : $tables tables (auth.users comprise), $lignes lignes, séquences, politiques, triggers et fonctions."
  exit 0
fi
echo "ÉCARTS entre la source (<) et la cible (>) : objet, nombre, empreinte" >&2
grep '^[<>]' "$TMP/ecarts.txt" >&2
exit 1
