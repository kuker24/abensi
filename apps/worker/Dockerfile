FROM node:20-alpine
WORKDIR /app

COPY apps/worker/package*.json ./
RUN npm ci --omit=dev

COPY apps/worker/src ./src

USER node
CMD ["node", "src/index.js"]
