# ---- build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install all dependencies (including dev) so TypeScript can compile
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies for the runtime image
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Run as the unprivileged user that ships with the base image
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public

USER node

EXPOSE 3000

# Schema is applied by `npm run migration:run:prod` (see README "Deployment"),
# not on boot, so a crash-looping container can't repeatedly mutate the DB.
CMD ["node", "dist/index.js"]
