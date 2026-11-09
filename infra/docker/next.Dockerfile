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
ARG APP
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile
ENV NX_DAEMON=false NX_NO_CLOUD=true NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN test -n "$APP" && pnpm nx run ${APP}:build
RUN mkdir -p /out && cp -r apps/${APP}/.next/standalone/. /out/ \
 && mkdir -p /out/apps/${APP}/.next && cp -r apps/${APP}/.next/static /out/apps/${APP}/.next/static \
 && if [ -d apps/${APP}/public ]; then cp -r apps/${APP}/public /out/apps/${APP}/public; fi

FROM ${NODE_IMAGE} AS runtime
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APP=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["sh", "-c", "exec node apps/${APP}/server.js"]
