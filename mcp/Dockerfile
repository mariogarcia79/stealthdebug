FROM node:24-trixie-slim AS builder

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --prefer-offline --no-audit --no-fund
COPY src ./src
ENV NODE_OPTIONS=--max_old_space_size=512
RUN ./node_modules/.bin/tsc -p . \
 && rm -rf dist/test

# Production stage
FROM node:24-trixie-slim

# Set by CI to the current ISO week so this layer is rebuilt weekly
ARG SECURITY_REFRESH=manual
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only; npm/npx/corepack removed (see backend/Dockerfile)
RUN npm ci --omit=dev --prefer-offline --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /root/.npm
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 4100
CMD ["node", "dist/index.js"]
