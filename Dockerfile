# syntax=docker/dockerfile:1.7

# ─── builder ──────────────────────────────────────────────────────────────
# Installs every workspace dep (incl. dev) and builds both frontend and
# backend. Using a single builder stage keeps the workspace symlinks
# intact, which is what `npm --workspace` relies on.
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY tsconfig.json ./
COPY backend ./backend
COPY frontend ./frontend
RUN npm run build

# ─── prod deps ────────────────────────────────────────────────────────────
# A clean install that drops devDependencies. Keeping this in its own
# stage means the final image gets a minimal node_modules tree without
# the Vite / TypeScript / Vitest footprint.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev

# ─── runtime ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app

# Run as the built-in non-root `node` user and give it ownership of the
# mounted data directory. Fastify serves the compiled frontend from
# `../../frontend/dist` relative to the backend entrypoint, so the
# workspace layout must be preserved.
RUN mkdir -p /data && chown -R node:node /data
USER node

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=deps  --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=deps  --chown=node:node /app/frontend/package.json ./frontend/package.json
COPY --from=builder --chown=node:node /app/backend/dist ./backend/dist
COPY --from=builder --chown=node:node /app/backend/drizzle ./backend/drizzle
COPY --from=builder --chown=node:node /app/frontend/dist ./frontend/dist

VOLUME ["/data"]
EXPOSE 4000

CMD ["node", "backend/dist/server.js"]
