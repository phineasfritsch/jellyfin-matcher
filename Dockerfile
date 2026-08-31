FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

COPY . .
RUN npm run build

# Stamped by CI so /healthz can report which commit is running and
# `npm run prod:read` can prove parity with the repository.
ARG GIT_SHA=dev
ENV MATCHER_VERSION=$GIT_SHA

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "server/index.ts"]
