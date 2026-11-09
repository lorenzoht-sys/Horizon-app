# Application Horizon pour Clever Cloud (ORGA_HDS) : front statique + routes api/
# dans un seul conteneur, servi par clevercloud/serveur/serveur.mjs.
# Sur Clever Cloud : CC_DOCKERFILE=clevercloud/Dockerfile.app (contexte = racine du dépôt).
#
# Image figée (jamais de tag latest). Avant la mise en service, remplacer le tag
# par son empreinte (node:22.11.0-alpine@sha256:…) relevée avec `docker pull`.

# ── Étape 1 : build ───────────────────────────────────────────────────────────
FROM node:22.11.0-alpine AS build
WORKDIR /app

# Variables du front : lues par Vite AU BUILD, donc à fournir comme arguments
# de build (sur Clever Cloud, les variables de l'application déclarées en ARG
# sont transmises au build ; à vérifier sur la plateforme). Aucune n'est secrète.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_SENTRY_DSN
ARG VITE_VERCEL_ENV

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build \
 && npx tsc -p clevercloud/tsconfig.api-build.json \
 && npm prune --omit=dev

# ── Étape 2 : exécution ───────────────────────────────────────────────────────
FROM node:22.11.0-alpine
WORKDIR /app
ENV NODE_ENV=production
# Le serveur lit vercel.json (en-têtes de sécurité) : une seule source de vérité.
COPY --from=build /app/package.json /app/vercel.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-api ./dist-api
COPY --from=build /app/clevercloud/serveur ./clevercloud/serveur
# Aucune écriture disque à l'exécution (instances immuables) : utilisateur non root.
USER node
EXPOSE 8080
CMD ["node", "clevercloud/serveur/serveur.mjs"]
