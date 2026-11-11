# PostgREST pour Horizon sur Clever Cloud (ORGA_HDS).
# Le front praticien lit et écrit 46 tables via supabase-js, qui parle
# PostgREST : ce service remplace celui que Supabase fournissait, avec la RLS
# inchangée (auth.uid() recréé par clevercloud/sql/01_compat_auth.sql).
# Sur Clever Cloud : CC_DOCKERFILE=clevercloud/postgrest/Dockerfile.
#
# Version figée (jamais latest) ; épingler l'empreinte sha256 avant la mise en
# service. Toute la configuration passe par les variables PGRST_* de
# l'application (voir clevercloud/postgrest/variables.env.example).
FROM postgrest/postgrest:v12.2.3
ENV PGRST_SERVER_PORT=8080
EXPOSE 8080
