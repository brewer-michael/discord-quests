# Discord Quests: one image for the bot and the setup page.
# Build:     docker build -t discord-quests .
# Bot:       docker run --env-file .env discord-quests
# Web page:  docker run --env-file .env -p 3000:3000 discord-quests pnpm --filter @dq/web start
FROM node:22-bookworm-slim

# Fonts for the map renderer.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @dq/web build && chown -R node:node apps/web/.next

ENV NODE_ENV=production
ENV HEALTH_PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["pnpm", "--filter", "@dq/bot", "start"]
