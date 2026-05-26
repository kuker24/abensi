FROM node:20-alpine
WORKDIR /app

COPY apps/worker/package*.json ./
RUN npm ci --omit=dev

COPY apps/worker/src ./src

CMD ["node", "src/index.js"]
