FROM node:20-trixie-slim AS builder

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
FROM node:20-trixie-slim

WORKDIR /app

# Copy package files and lockfile
COPY package*.json ./
COPY package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev --prefer-offline --no-audit --no-fund

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory and assign ownership to the built-in non-root node user
RUN mkdir -p public/uploads && chown -R node:node /app

USER node

EXPOSE 4000

CMD ["node", "dist/index.js"]