# Discord Quests: one image for the bot and the setup page.
# Build:     docker build -t discord-quests .
# Bot:       docker run --env-file .env discord-quests
# Web page:  docker run --env-file .env -p 3000:3000 discord-quests node apps/web/node_modules/next/dist/bin/next start apps/web
# Both start node directly (not through pnpm) so it receives SIGTERM and shuts down cleanly.
FROM node:22-bookworm-slim

# Fonts for the map renderer.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Keep pnpm where the unprivileged runtime user can use it without downloading it again.
ENV COREPACK_HOME=/usr/local/share/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate && chmod -R a+rX /usr/local/share/corepack

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN NEXT_TELEMETRY_DISABLED=1 pnpm --filter @dq/web build && chown -R node:node apps/web/.next

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ENV HEALTH_PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "--import", "tsx", "apps/bot/src/main.ts"]
