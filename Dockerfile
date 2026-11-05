# Interview Copilot image. Built off-box (GitHub Actions); the VPS never builds.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
# drizzle/sqlite is applied at startup when MIGRATE_ON_BOOT=true.
COPY --from=build /app/drizzle ./drizzle
# SQLite lives here. A named volume mounted at /data inherits this ownership.
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "dist/index.js"]
