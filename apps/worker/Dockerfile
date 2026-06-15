FROM node:20-alpine
WORKDIR /app

COPY apps/worker/package*.json ./
RUN npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY apps/worker/src ./src

USER node
CMD ["node", "src/index.js"]
