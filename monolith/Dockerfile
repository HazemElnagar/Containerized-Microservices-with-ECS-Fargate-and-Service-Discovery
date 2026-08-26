# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-alpine

# Use production node environment by default.
ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /usr/src/app

# Download dependencies as a separate step to take advantage of Docker's caching.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Copy the rest of the source files into the image owned by node user
COPY --chown=node:node . .

# Run the application as a non-root user.
USER node

# Expose the port that the application listens on (matches Express default PORT 8080)
EXPOSE 8080

# Add Container Healthcheck for AWS ECS Fargate container monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run node directly (PID 1) so OS signals (SIGTERM / SIGINT) are received for graceful shutdown
CMD ["node", "src/server.js"]
