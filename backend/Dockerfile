FROM node:24-trixie-slim AS builder

WORKDIR /app

# Copy package files (including lockfile) for deterministic installs
COPY package*.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

# Install dev dependencies needed for the build
RUN npm ci --prefer-offline --no-audit --no-fund

# Copy source code
COPY src ./src

# Use a conservative memory cap for tsc to fit within small VPS RAM
ENV NODE_OPTIONS=--max_old_space_size=512

# Build TypeScript
RUN node --max_old_space_size=512 ./node_modules/.bin/tsc

# Production stage
FROM node:24-trixie-slim

# Set by CI to the current ISO week so this layer is rebuilt weekly
ARG SECURITY_REFRESH=manual
# Apply Debian security updates released after the base image was built
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and lockfile
COPY package*.json ./
COPY package-lock.json ./

# Install only production dependencies, then remove npm/npx/corepack: the
# app runs with plain `node` and never needs them, and the npm bundled in the
# Node image carries its own dependency CVEs (e.g. undici, brace-expansion).
RUN npm ci --omit=dev --prefer-offline --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /root/.npm

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory and assign ownership to the built-in non-root node user
RUN mkdir -p public/uploads && chown -R node:node /app

USER node

EXPOSE 4000

CMD ["node", "dist/index.js"]