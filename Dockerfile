FROM node:22-slim AS base

RUN corepack enable pnpm

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Production
FROM node:22-slim AS production

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/server.js"]
