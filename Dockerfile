# Multi-stage, because the single-stage image shipped the whole toolchain.
#
# The old image was one layer: `npm ci` with dev dependencies, the source, the
# build, and then the app running out of the same tree as root. That meant
# vitest, tailwind, typescript, puppeteer-core and the tests themselves were on
# the host's disk and inside the running container -- a few hundred megabytes
# nobody asked for, and a much larger surface than an app that serves a swipe
# deck needs.

# ---- deps: everything, because the build needs the dev tooling ---------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

# ---- build: compile the Next app --------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod-deps: the same lockfile, without the toolchain --------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# tsx runs the server, so it has to survive the prune; everything else that is
# only needed to build or test does not.
RUN npm ci --omit=dev --no-fund --no-audit && npm install --no-save tsx@^4

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# wget is busybox's, already present on alpine, and is what HEALTHCHECK uses.
RUN addgroup -S matcher && adduser -S matcher -G matcher

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.ts tsconfig.json ./
COPY server ./server
COPY src ./src
COPY app ./app

# The ratings cache lives here and is the one thing worth mounting.
RUN mkdir -p /app/.cache && chown -R matcher:matcher /app/.cache
USER matcher

# Stamped by CI so /healthz can report which commit is running and
# `npm run prod:read` can prove parity with the repository.
ARG GIT_SHA=dev
ENV MATCHER_VERSION=$GIT_SHA

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Ravi's blocker: an unhealthy container looked identical to a healthy one, so
# `docker ps` said "Up 3 hours" for a process that could not reach Jellyfin.
# /healthz is read-only and reports which upstreams are configured.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:${PORT}/healthz || exit 1

CMD ["npx", "tsx", "server/index.ts"]
