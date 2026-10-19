# Deploying on Railway

Railway runs each part as its own service from this repository.

1. Create a project and add **PostgreSQL**.
2. Add a service from this GitHub repository for the **bot**. Railway builds the `Dockerfile` automatically.
   - Variables: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MASTER_KEYS`, `WEB_BASE_URL`, `DATABASE_URL`
     (reference the Postgres service's `DATABASE_URL`), optionally a story AI key (`OPENAI_API_KEY` or `GEMINI_API_KEY`), and `LOG_FORMAT=json`.
   - Keep it at **one replica**: the bot holds Discord's gateway connection and the round timers.
3. Add a second service from the same repository for the **setup page**.
   - Settings → Deploy → Custom start command: `node apps/web/node_modules/next/dist/bin/next start apps/web`
   - Variables: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `MASTER_KEYS`, `DATABASE_URL`, `WEB_BASE_URL`
     (this service's public domain), `LOG_FORMAT=json`.
   - Generate a public domain, and add `https://<that domain>/auth/callback` as a redirect in the Discord
     Developer Portal (OAuth2).
4. Add a third service from the same repository for the **story writer**, which writes the story ahead of the
   table in the background.
   - Settings → Deploy → Custom start command: `node --import tsx apps/writer/src/main.ts`
   - Variables: `DATABASE_URL`, `MASTER_KEYS`, the same story AI key as the bot (if any), `LOG_FORMAT=json`.
5. All the services must use the **same** `MASTER_KEYS`.
