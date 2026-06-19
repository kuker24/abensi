FROM node:20-alpine AS build
WORKDIR /workspace/apps/api

RUN apk add --no-cache openssl

COPY packages/shared ../../packages/shared
COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api ./
COPY prisma ../../prisma
COPY scripts ../../scripts

RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app/apps/api
ENV NODE_ENV=production

RUN apk add --no-cache openssl \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY --from=build /workspace/packages /app/packages
COPY --from=build /workspace/apps/api/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package*.json ./
COPY --from=build --chown=node:node /workspace/apps/api/assets ./assets
RUN find ./assets -type d -exec chmod 755 {} + \
  && find ./assets -type f -exec chmod 644 {} +
COPY --from=build /workspace/prisma ./prisma

USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/main.js"]
