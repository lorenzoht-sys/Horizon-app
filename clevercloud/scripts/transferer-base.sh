#!/usr/bin/env bash
# Transfert de la base d'Horizon de Supabase vers le PostgreSQL de Clever Cloud
# (2026-11-16, migration HDS) : schéma, comptes des praticiens (identifiant et
# e-mail seulement), données, puis contrôle ligne à ligne.
#
# Pourquoi un script plutôt qu'un simple pg_dump | psql :
#   - l'ordre compte. Un dump « données seules » rejoué sur un schéma complet
#     déclenche les triggers (identité du praticien réécrite depuis auth.uid(),
#     qui est NULL hors requête ; garde-fou RGPD ; numérotation et
#     inaltérabilité des factures ; recalcul des brouillons). Les données
#     arriveraient modifiées ou seraient refusées. Désactiver les triggers
#     demande d'être superutilisateur, ce que l'add-on ne permet pas. On rejoue
#     donc les trois sections de pg_dump dans l'ordre : structure, DONNÉES,
#     puis index, contraintes, triggers et politiques RLS. Les triggers
#     n'existent pas encore quand les lignes arrivent ;
#   - auth.users n'est pas dans le schéma public : on n'en copie que
#     l'identifiant, l'e-mail et la date de création. Aucun mot de passe ne
#     quitte Supabase ;
#   - le nettoyeur (nettoyer-dump.mjs) ne doit lire que la structure, jamais
#     les données : il découpe du SQL, pas des lignes COPY.
#
# Sûretés :
#   - la SOURCE n'est que lue (transactions en lecture seule) ;
#   - la CIBLE doit être vide : le script refuse une base dont le schéma
#     public contient déjà une table. Il ne peut donc rien écraser ;
#   - les données passent d'une base à l'autre par un tube : rien n'est écrit
#     sur le disque du poste, sauf la structure (sans donnée), dans un dossier
#     temporaire supprimé à la fin ;
#   - il se termine par comparer-bases.sh et sort en erreur au moindre écart.
#
# Avant de le lancer en production : mettre l'application en maintenance. Les
# trois sections sont lues l'une après l'autre ; une écriture entre deux
# lectures ferait échouer la comparaison finale (sans rien abîmer : on vide la
# cible et on recommence).
#
# Usage (sur le poste de Lorenzo, qui saisit lui-même les adresses) :
#   SOURCE_URI=postgresql://…supabase…  CIBLE_URI=postgresql://…clever-cloud… \
#   CIBLE=staging  clevercloud/scripts/transferer-base.sh
# CIBLE vaut staging ou production (marqueur transmis aux fichiers SQL).
# pg_dump et psql doivent être au moins de la version du serveur source (17).
set -euo pipefail

: "${SOURCE_URI:?SOURCE_URI est obligatoire (base Supabase, lue seulement)}"
: "${CIBLE_URI:?CIBLE_URI est obligatoire (base Clever Cloud, vide)}"
: "${CIBLE:?CIBLE est obligatoire : staging ou production}"
if [ "$CIBLE" != "staging" ] && [ "$CIBLE" != "production" ]; then
  echo "CIBLE doit valoir staging ou production." >&2
  exit 2
fi
if [ "$SOURCE_URI" = "$CIBLE_URI" ]; then
  echo "Refus : SOURCE_URI et CIBLE_URI sont identiques." >&2
  exit 2
fi

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
umask 077
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

LECTURE_SEULE="-c default_transaction_read_only=on"
source_sql() { PGOPTIONS="$LECTURE_SEULE" psql "$SOURCE_URI" -X -q -v ON_ERROR_STOP=1 "$@"; }
cible_sql() { psql "$CIBLE_URI" -X -q -v ON_ERROR_STOP=1 "$@"; }
dump() { PGOPTIONS="$LECTURE_SEULE" pg_dump "$SOURCE_URI" --schema=public --no-owner --section="$1"; }

echo "0/7 Vérifications"
deja=$(cible_sql -At -c "select count(*) from pg_tables where schemaname = 'public'")
if [ "$deja" != "0" ]; then
  echo "Refus : le schéma public de la cible contient déjà $deja table(s). Base vide exigée." >&2
  exit 1
fi
v_source=$(source_sql -At -c "show server_version_num")
v_cible=$(cible_sql -At -c "show server_version_num")
v_outil=$(pg_dump --version | sed -E 's/.* ([0-9]+)\..*/\1/')
if [ "$v_outil" -lt "$((v_source / 10000))" ]; then
  echo "Refus : pg_dump $v_outil est plus ancien que le serveur source ($((v_source / 10000)))." >&2
  exit 1
fi
if [ "$((v_cible / 10000))" -lt "$((v_source / 10000))" ]; then
  echo "Refus : la cible (PostgreSQL $((v_cible / 10000))) est plus ancienne que la source ($((v_source / 10000)))." >&2
  exit 1
fi
# Les trois rôles d'API doivent exister et être endossables par l'utilisateur
# de la cible (PostgREST fait SET ROLE à chaque requête) ; service_role doit
# traverser la RLS, sinon toutes les routes api/ liraient zéro ligne.
cible_sql <<'SQL'
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      RAISE EXCEPTION 'Rôle % absent de la cible : à demander au support Clever Cloud.', r;
    END IF;
    IF NOT pg_has_role(current_user, r, 'MEMBER') THEN
      RAISE EXCEPTION 'L''utilisateur de la cible n''est pas membre du rôle % (GRANT % TO <utilisateur>, par le support).', r, r;
    END IF;
  END LOOP;
END $$;
SQL
contourne=$(cible_sql -At -c "select rolbypassrls from pg_roles where rolname = 'service_role'")
if [ "$contourne" != "t" ]; then
  echo "    service_role n'a pas BYPASSRLS : clevercloud/sql/05_service_role_sans_bypassrls.sql sera joué après la restauration."
fi

echo "1/7 Schéma auth de compatibilité"
cible_sql -v cible="$CIBLE" -f "$RACINE/clevercloud/sql/01_compat_auth.sql" >/dev/null

# check_function_bodies = off : comme pg_restore, les corps sont vérifiés à l'exécution.
appliquer_structure() {
  dump "$1" > "$TMP/$1.sql"
  node "$RACINE/clevercloud/scripts/nettoyer-dump.mjs" "$TMP/$1.sql" "$TMP/$1.net.sql" "$TMP/$1.rapport.md" | sed 's/^/    /'
  PGOPTIONS="-c check_function_bodies=off -c client_min_messages=warning" cible_sql -f "$TMP/$1.net.sql" >/dev/null
}

echo "2/7 Structure (tables, fonctions, droits)"
appliquer_structure pre-data

echo "3/7 Comptes des praticiens : identifiant, e-mail, date de création"
source_sql -c "\copy (select id, email, created_at from auth.users order by id) to stdout" \
  | cible_sql -c "\copy auth.users (id, email, created_at) from stdin"

echo "4/7 Données (aucun trigger n'existe encore sur la cible)"
dump data | cible_sql >/dev/null

echo "5/7 Index, contraintes, triggers et politiques RLS"
appliquer_structure post-data

echo "6/7 Compléments de la cible"
complement() { PGOPTIONS="-c client_min_messages=warning" cible_sql -v cible="$CIBLE" -f "$RACINE/clevercloud/sql/$1" >/dev/null; }
complement 04_apres_restauration.sql
complement 03_facture_pdf_sans_pg_net.sql
if [ "$contourne" != "t" ]; then complement 05_service_role_sans_bypassrls.sql; fi
# Le rapport du nettoyeur ne contient que des instructions de structure.
if [ -n "${RAPPORT:-}" ]; then
  cat "$TMP/pre-data.rapport.md" "$TMP/post-data.rapport.md" > "$RAPPORT"
  echo "    rapport du nettoyeur : $RAPPORT"
fi

echo "7/7 Comparaison de la source et de la cible"
"$RACINE/clevercloud/scripts/comparer-bases.sh"
echo "Transfert terminé sans écart."
