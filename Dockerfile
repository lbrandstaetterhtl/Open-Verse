# ============================================================
# Stage 1: Builder
# Installs ALL dependencies and compiles the project.
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files and install ALL dependencies (including devDeps for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY . .

# Build frontend (Vite) and backend (esbuild)
RUN npm run build

# ============================================================
# Stage 2: Runner
# Lean production image – only what's needed to run.
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy package files and install PRODUCTION dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Copy other required runtime files
COPY drizzle.config.ts ./
COPY shared ./shared
COPY migrations ./migrations

# Create required runtime dirs and set permissions
# /app/data: only for SQLite mode (SQLITE_PATH=/app/data/local.db plus a volume), never served publicly.
# /app/logs: owner + group only (the log files contain IPs and user agents).
RUN mkdir -p /app/uploads /app/logs /app/data \
    && chown appuser:appgroup /app/uploads /app/logs /app/data \
    && chmod 750 /app/logs \
    && chmod 700 /app/data \
    && chown -R appuser:appgroup /app/dist

USER appuser

# The app listens on this port (the image also contains the migration entrypoint
# dist/db-maintenance/migrate.js, used by the docker-compose service "migrate")
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
