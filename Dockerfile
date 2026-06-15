# syntax=docker/dockerfile:1

# Builds and runs the Baza server (Expo Router `output: "server"`) for Fly.io.
# Build context is the MONOREPO ROOT — the build needs the pnpm workspace and the
# @baza/types + @baza/i18n packages, not just apps/mobile.
#
# Stages:
#   deps   — install the full workspace once (cached on lockfile changes)
#   build  — prisma generate + `expo export -p web` → apps/mobile/dist
#   runtime— prod-only deps + the export output; boots with `migrate deploy`
ARG NODE_VERSION=22

# ---- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Workspace manifests first so the install layer caches across source edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/types/package.json packages/types/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile

# ---- build ------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/mobile/node_modules ./apps/mobile/node_modules
COPY --from=deps /repo/packages/types/node_modules ./packages/types/node_modules
# packages/i18n has no own dependencies, so pnpm creates no node_modules there.
COPY . .

# EXPO_PUBLIC_* are inlined into the bundle at export time, so they must be
# present here, not just at runtime. Defaults are empty (links/banner disabled).
ARG EXPO_PUBLIC_API_URL=""
ARG EXPO_PUBLIC_LINK_HOST=""
ARG EXPO_PUBLIC_IOS_STORE_URL=""
ARG EXPO_PUBLIC_ANDROID_STORE_URL=""
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_LINK_HOST=$EXPO_PUBLIC_LINK_HOST \
    EXPO_PUBLIC_IOS_STORE_URL=$EXPO_PUBLIC_IOS_STORE_URL \
    EXPO_PUBLIC_ANDROID_STORE_URL=$EXPO_PUBLIC_ANDROID_STORE_URL

WORKDIR /repo/apps/mobile
# prisma.config.ts requires DATABASE_URL to load, but `generate` never connects —
# a dummy value satisfies the config loader. The real URL is a Fly runtime secret.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm exec prisma generate
# Metro bundles every API route + the SSR web pages here, which is memory-hungry.
# Size the heap from the builder's actual RAM (default 3072MB) so the export
# doesn't OOM on a small builder yet can use more on a larger one.
ARG NODE_BUILD_HEAP_MB=3072
RUN NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_HEAP_MB}" pnpm run build:server

# ---- runtime ----------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo

# Prod-only deps keep the runtime image lean.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/types/package.json packages/types/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --frozen-lockfile --prod

# Source needed at runtime: the export output, the server entry, the generated
# Prisma client, the Prisma schema + migrations (for `migrate deploy` on boot),
# prisma.config.ts, and the workspace package source the client resolves.
COPY --from=build /repo/apps/mobile/dist ./apps/mobile/dist
COPY --from=build /repo/apps/mobile/generated ./apps/mobile/generated
COPY apps/mobile/server ./apps/mobile/server
COPY apps/mobile/prisma ./apps/mobile/prisma
COPY apps/mobile/prisma.config.ts ./apps/mobile/prisma.config.ts
COPY packages ./packages

# `prisma` CLI is a devDependency, so a prod install drops it. Pull just the CLI
# back in (pinned) so the boot step can run `migrate deploy`.
WORKDIR /repo/apps/mobile
RUN pnpm add -D prisma@7.4.0 --ignore-scripts

EXPOSE 8081

# Boot: apply pending migrations (never push/reset — repo rule), then serve.
# A failed migrate aborts boot so a bad release can't run against a stale schema.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm run start:server"]
