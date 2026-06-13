FROM node:20-bookworm-slim AS build
WORKDIR /app/apps/api

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY packages/shared ../../packages/shared
COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api ./
COPY prisma ../../prisma

RUN npx prisma generate --schema ../../prisma/schema.prisma
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app/apps/api
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package*.json ./
COPY --from=build /app/prisma /app/prisma

USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/main.js"]
