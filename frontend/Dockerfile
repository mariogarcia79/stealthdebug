# Frontend Dockerfile - Fixed for Podman
# File: sources/frontend/Dockerfile

# Build stage - Use fully qualified image name
FROM docker.io/library/node:24-alpine AS builder

WORKDIR /app

# Copy package files (including lockfile)
COPY package*.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit --no-fund

# Copy source
COPY . .

# Limit Node memory for the build to avoid OOM on small VPS
ENV NODE_OPTIONS=--max_old_space_size=512

# Build the app (creates dist directory)
RUN npm run build

# Production stage - Use fully qualified image name
FROM docker.io/library/nginx:alpine

# Set by CI to the current ISO week so this layer is rebuilt weekly
ARG SECURITY_REFRESH=manual
# Apply Alpine security updates released after the base image was built
RUN apk upgrade --no-cache

# Copy built files to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config for React routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]