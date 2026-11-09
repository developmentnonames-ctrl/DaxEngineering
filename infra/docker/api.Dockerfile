# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-alpine
ARG PNPM_VERSION=11.8.0

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile
ENV NX_DAEMON=false NX_NO_CLOUD=true
RUN pnpm nx run api:build:production && pnpm nx run api:prune
# Hoisted install so main.js, which bundles only our libraries, can resolve npm dependencies.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    cd apps/api/dist && pnpm install --prod --frozen-lockfile --config.node-linker=hoisted --config.auto-install-peers=false

# Keep these versions in step with the lockfile.
FROM ${NODE_IMAGE} AS migrate
ARG PRISMA_VERSION=7.10.1
ARG PG_VERSION=8.23.1
ARG TSX_VERSION=4.23.15
WORKDIR /migrate
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev prisma@${PRISMA_VERSION} pg@${PG_VERSION} tsx@${TSX_VERSION} \
 && npm cache clean --force
COPY libs/platform/db/prisma ./prisma
COPY libs/platform/db/scripts ./scripts
COPY libs/platform/db/prisma.config.ts ./
USER node
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && npx --no-install tsx scripts/apply-grants.ts"]

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/api/dist ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1
CMD ["node", "main.js"]
