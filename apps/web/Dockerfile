FROM node:20-alpine AS build
WORKDIR /workspace/apps/web

COPY packages/shared ../../packages/shared
COPY apps/web/package*.json ./
RUN npm ci

COPY apps/web ./

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
RUN apk upgrade --no-cache && rm -rf /var/cache/apk/*
COPY ops/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
