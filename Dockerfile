# ─── Build backend (TypeScript → dist) ──────────────────────────
FROM node:24-alpine AS backend
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm exec tsc

# ─── Build frontend (Vite) ───────────────────────────────────────
FROM node:24-alpine AS frontend
WORKDIR /client
RUN npm install -g pnpm@10
COPY client/package.json client/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY client/ ./
RUN pnpm build

# ─── Runtime (zero dependency — chỉ cần Node) ────────────────────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/rental.db \
    CLIENT_DIR=/app/public

COPY --from=backend /app/dist ./dist
COPY --from=frontend /client/dist ./public
COPY package.json ./

RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/src/server.js"]
