# Android Build-Tools 35.0.0 is fetched directly from Google's official repository.
# repository2-1.xml publishes SHA-1 (2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc), not SHA-256.
# SHA-256 below was captured from archive bytes after that archive verified against Google's official SHA-1;
# it is an observed pin, not a Google-published SHA-256.
FROM debian:bookworm-slim AS android-tools
ARG ANDROID_BUILD_TOOLS_URL=https://dl.google.com/android/repository/build-tools_r35_linux.zip
ARG ANDROID_BUILD_TOOLS_SHA1=2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc
ARG ANDROID_BUILD_TOOLS_SHA256=bd3a4966912eb8b30ed0d00b0cda6b6543b949d5ffe00bea54c04c81e1561d88
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl --fail --location --proto '=https' --tlsv1.2 "$ANDROID_BUILD_TOOLS_URL" -o /tmp/build-tools.zip \
  && echo "$ANDROID_BUILD_TOOLS_SHA1  /tmp/build-tools.zip" | sha1sum -c - \
  && echo "$ANDROID_BUILD_TOOLS_SHA256  /tmp/build-tools.zip" | sha256sum -c - \
  && mkdir -p /opt/android-sdk/build-tools/35.0.0 \
  && unzip -q /tmp/build-tools.zip -d /tmp/android-build-tools \
  && mv /tmp/android-build-tools/android-15/* /opt/android-sdk/build-tools/35.0.0/ \
  && test -x /opt/android-sdk/build-tools/35.0.0/aapt \
  && test -x /opt/android-sdk/build-tools/35.0.0/apksigner \
  && rm -rf /tmp/build-tools.zip /tmp/android-build-tools

FROM node:20-bookworm-slim AS build
WORKDIR /workspace/apps/api

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY packages/shared ../../packages/shared
COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api ./
COPY prisma ../../prisma
COPY scripts ../../scripts

RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app/apps/api
ENV NODE_ENV=production \
    ANDROID_AAPT_PATH=/opt/android-sdk/build-tools/35.0.0/aapt \
    ANDROID_APKSIGNER_PATH=/opt/android-sdk/build-tools/35.0.0/apksigner

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY --from=android-tools /opt/android-sdk /opt/android-sdk
COPY --from=build /workspace/packages /app/packages
COPY --from=build /workspace/apps/api/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package*.json ./
COPY --from=build --chown=node:node /workspace/apps/api/assets ./assets
RUN find ./assets -type d -exec chmod 755 {} + \
  && find ./assets -type f -exec chmod 644 {} + \
  && mkdir -p /app/uploads/android-apk-releases \
  && chown -R node:node /app/uploads \
  && /opt/android-sdk/build-tools/35.0.0/aapt version \
  && /opt/android-sdk/build-tools/35.0.0/apksigner version
COPY --from=build /workspace/prisma ./prisma

USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/main.js"]
