# Running Discord Quests

## 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **Bot**, reset and copy the token (`DISCORD_TOKEN`). No privileged intents are needed: the bot never
   reads message content.
3. Copy the **Application ID** from General Information (`DISCORD_CLIENT_ID`).
4. Invite the bot with this URL (replace `CLIENT_ID`):

   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=2252194950794240
   ```

   That asks for: View Channels, Send Messages, Send Messages in Threads, Create Public and Private Threads,
   Manage Threads, Embed Links, Attach Files, Read Message History and Pin Messages. Nothing else.

## 2. Configure

Copy `.env.example` to `.env` and fill in:

| Variable | What it's for |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | From step 1 |
| `DATABASE_URL` | Postgres 15+ (Neon, Supabase, RDS, Railway, or the included docker-compose) |
| `MASTER_KEYS` | Encrypts API keys saved on the setup page. `v1:` plus 32 random bytes in base64 |
| `ANTHROPIC_API_KEY` | Optional server default for the story AI (Claude). Servers can bring their own keys |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Optional server defaults (OpenAI is also used for scene images) |
| `DEFAULT_DAILY_BUDGET_USD`, `DEFAULT_DAILY_IMAGE_CAP` | Caps on server-default keys per Discord server per day (defaults: $5, 30 images) |
| `ALLOW_PRIVATE_ENDPOINTS` | `true` lets servers use AI running on your own network (Ollama, LM Studio, Automatic1111) |

Without any AI configured the bot still works: the engine tells each turn itself from the world's text.

## 3. Run

```sh
pnpm install
docker compose up -d postgres          # or point DATABASE_URL at a managed Postgres
pnpm --filter @dq/bot register         # registers slash commands (instantly with DISCORD_DEV_GUILD_ID)
pnpm --filter @dq/bot start            # applies migrations, then connects to Discord
```

Or with Docker: `docker compose --profile bot up -d`.

The bot serves a health check at `http://localhost:8080/healthz`.

## 4. Play

1. In any text channel: `/campaign new name:Lights Out`. The bot opens a thread for the adventure.
2. Everyone presses **Join** and **Make my hero** in the thread.
3. The host presses **Begin the adventure**.
4. Each turn, players press a choice (or **Something else…** to describe their own). When everyone has chosen, or
   the round timer runs out (3 minutes by default), the story continues.

## Hosting notes

- Any container host works (Railway, Fly.io, Render, a small VPS). One bot process comfortably serves thousands
  of servers.
- Use a managed Postgres with backups. Campaign history is append-only; `/campaign delete` purges a campaign
  completely.
- Round timers are restored from the database after restarts.
