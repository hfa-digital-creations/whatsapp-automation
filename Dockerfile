FROM node:20-bookworm-slim AS base

# Chromium + fonts/libs whatsapp-web.js (via Puppeteer) needs to actually render WhatsApp Web.
# python3/make/g++ let bcrypt's native module build from source — its postinstall
# otherwise fetches a prebuilt binary from GitHub Releases, which isn't reachable from
# every build network (npm's own registry is a separate, more reliably-reachable host).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    dumb-init \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    npm_config_build_from_source=true

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
