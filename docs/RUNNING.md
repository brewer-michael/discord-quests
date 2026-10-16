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
5. For the setup page: under **OAuth2**, copy the **Client Secret** (`DISCORD_CLIENT_SECRET`) and add a redirect:
   `WEB_BASE_URL/auth/callback` (for example `http://localhost:3000/auth/callback`).

## 2. Configure

Copy `.env.example` to `.env` and fill in:

| Variable | What it's for |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | From step 1 |
| `WEB_BASE_URL` | Public address of the setup page. Use `https://` in production so sign-in cookies are Secure |
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
pnpm --filter @dq/bot start            # applies migrations, registers slash commands, connects to Discord
```

Slash commands are registered every time the bot starts (instantly in one server with `DISCORD_DEV_GUILD_ID`,
otherwise globally). `pnpm --filter @dq/bot register` does it by hand; `REGISTER_COMMANDS=false` skips it.

And the setup page, in another terminal:

```sh
pnpm web:build && pnpm --filter @dq/web start   # or `pnpm web:dev` while developing
```

To run everything in Docker on a server, see [Deploying with Docker Compose](#deploying-with-docker-compose).

The bot serves a health check at `http://localhost:8080/healthz`; the setup page listens on port 3000.

### The setup page

Anyone with **Manage Server** on a Discord server can sign in and, for that server:

- add **story services** (Claude, OpenAI, OpenRouter, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, Gemini,
  Ollama, LM Studio, vLLM, or any custom OpenAI-compatible endpoint) and **picture services** (OpenAI, Imagen,
  Gemini, Stability, Replicate, fal.ai, Automatic1111, an OpenAI-compatible image endpoint, or any HTTP API
  described with a request template), with a **Test connection** button that makes one tiny real call;
- choose which service and model does each job, with backups if the first one is down;
- set a daily budget and picture cap, and the defaults for new campaigns;
- see usage, pause, end, export or permanently delete campaigns, and (behind a spoiler warning that is logged)
  look at the hidden hand.

API keys are encrypted with `MASTER_KEYS` before they're stored and are never sent back to the browser. Every
change is recorded on the server's Activity page.

## 4. Set up each server

When the bot joins a server it posts a welcome message pointing to the setup guide (`WEB_BASE_URL/guide`, also
`/help topic:setup` in Discord). The bot needs two rooms:

- **A table room** (e.g. `#quest-table`) that everyone can see. Each campaign gets its own thread there, or can be
  played right in the room (`/campaign new place:Right in the table room`, one campaign at a time).
- **A private DM room** (e.g. `#dm-screen`) that only the DMs and the bot can see. In Assist mode each DM's private
  screen is a thread in this room, and only that DM is added to it.

Someone with **Manage Server** runs `/setup table:#quest-table dm-room:#dm-screen`. The bot checks it has the
permissions it needs in both rooms and refuses a DM room that everyone can see. `/setup` on its own shows how
things stand. Until rooms are chosen, `/campaign new` opens a thread in whatever channel it was used in.

## 5. Play

1. Anywhere on the server: `/campaign new name:Lights Out`. The adventure opens in the table room.
2. Everyone presses **Join** and **Make my hero** in the campaign's thread.
3. The host presses **Begin the adventure**.
4. Each turn, players press a choice (or **Something else…** to describe their own). The story continues when
   everyone has chosen, when the turn's time runs out, or when the host presses **Continue the story**.

### Game night or play by post

Each campaign has a pace, chosen with `/campaign new pace:…` and changed any time with `/campaign pace`:

| | Game night | Play by post |
|---|---|---|
| Time per turn | 3 minutes (2 minutes to 10) | 1 day (12 hours to a week, or no limit) |
| Pings | none: everyone's already there | the players who need to act, when a turn opens |
| Reminders | none | before the turn closes (a quarter of the way out, between 1 and 12 hours); daily if there's no limit |
| Nobody chose at all | the timer stops and the story waits | the turn gets another round of the timer, with a ping |

`/campaign pace timer:… pings:…` fine-tunes either one; `timer:No limit (wait for everyone)` switches the countdown
off so each turn waits until every player has chosen. On the setup page, leaving **Time to choose each turn** on
"Usual for the pace" gives new campaigns 3 minutes at game night and a day by post. `/campaign pause` stops the clock entirely (no deadline,
no reminders, nothing moves on); `/campaign resume` restarts the open turn's clock and pings the players.
Deadlines and reminders live in the database, so they survive restarts and deploys. Server-wide defaults for new
campaigns are on the setup page's Settings.

### Pictures

With a picture service set up on the setup page, each new place or challenge gets its own scene art (choose how
often under **Settings & budget** → **Scene art**). The host or DM can run `/campaign pictures` in a campaign's
thread to paint the places the story had already been: up to 10 at a time, oldest first, each posted in the thread
with the scene's name. Scenes told by the AI are painted from its own picture notes; scenes told without AI, from
the world's description of the place. Pictures count against the server's daily picture limit.

A picture service on your own network (Automatic1111, Forge, LocalAI and so on) needs `ALLOW_PRIVATE_ENDPOINTS=true`
in `.env`, its network address rather than `localhost`, and **This runs on my own network** ticked under **More
options** (already on for the Automatic1111 choice).

### With a human DM (Assist mode)

Start with `/campaign new storyteller:A person runs it, the bot helps dm:@you`. Alongside the table thread, the
bot opens a private **DM screen** thread that only the DM is added to.

- Each turn is written as a draft and posted to the DM screen first. The DM can **Send it**, **Edit** the narration
  and choices, **Redo with a note** ("make it spookier"), or **Write my own**. Players see nothing until the DM
  sends it.
- Drafts include notes on what the hidden hand is doing that turn. They appear only on the DM screen.
- `/dm say` posts the DM's own words to the table.
- `/loom view` lists the deeds waiting to matter, the shortcuts that will come back around, and who is being kept
  safe for later. `/loom plant` adds a deed by hand. `/loom mode` switches the hidden hand off if the DM would
  rather handle it themselves.

## Deploying with Docker Compose

`docker-compose.prod.yml` runs the whole thing on one server: Postgres, the bot, the setup page and, optionally,
[Caddy](https://caddyserver.com) for automatic HTTPS.

**You need** a Linux server with 2 GB of memory (or 1 GB plus swap: building the image runs the setup page's build),
[Docker with the Compose plugin](https://docs.docker.com/engine/install/), and a domain name (for example
`quests.example.com`) with a DNS record pointing at the server. Open ports 80 and 443.

**Using a subdomain of a domain you already have** (say `quests.yourname.me`, while `yourname.me` stays wherever it
is today):

- At your DNS host, add an **A** record with the name `quests` and the server's public IPv4 address as its value.
  Add an **AAAA** record only if the server really has working IPv6: Let's Encrypt tries IPv6 first, and a stale
  one makes the certificate fail.
- On **Cloudflare**, set the record to **DNS only** (grey cloud) so Caddy can get its own certificate.
- Before the first start, check that `dig +short quests.yourname.me` prints the server's address. Too many failed
  certificate attempts lock you out for an hour.
- Use the full name everywhere: `DOMAIN=quests.yourname.me`, `WEB_BASE_URL=https://quests.yourname.me` and the
  redirect `https://quests.yourname.me/auth/callback` in the Developer Portal.
- If your main site already runs on **the same server** and uses ports 80 and 443, leave out the `https` profile and
  add the subdomain to that site's reverse proxy instead (see the notes below). On a **home server**, forward
  ports 80 and 443 on your router, or use a Cloudflare Tunnel without the `https` profile.

1. **Discord application:** follow [step 1](#1-create-the-discord-application) and use
   `https://quests.example.com/auth/callback` as the OAuth2 redirect.
2. **Get the code and configure it:**

   ```sh
   git clone https://github.com/brewer-michael/discord-quests.git && cd discord-quests
   cp .env.example .env
   ```

   In `.env`, fill in:

   | Variable | Value |
   |---|---|
   | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | From the Developer Portal |
   | `MASTER_KEYS` | The output of `echo "v1:$(openssl rand -base64 32)"`. Keep a copy in a password manager |
   | `POSTGRES_PASSWORD` | The output of `openssl rand -hex 24` |
   | `DOMAIN` | `quests.example.com` |
   | `WEB_BASE_URL` | `https://quests.example.com` |
   | `ANTHROPIC_API_KEY` | Optional: a server-wide default for the story AI |

   `DATABASE_URL` is ignored here; the stack builds its own from `POSTGRES_PASSWORD`.
3. **Start it:**

   ```sh
   docker compose -f docker-compose.prod.yml --profile https up -d --build
   ```

   The first build takes a few minutes. Postgres starts, the database is migrated, then the bot and the setup page
   start. The bot registers its slash commands, and Caddy fetches an HTTPS certificate for `DOMAIN`.
4. **Check it:** `docker compose -f docker-compose.prod.yml ps` shows `bot` and `web` as healthy, and
   `https://quests.example.com/guide` opens. If the bot isn't healthy, `docker compose -f docker-compose.prod.yml
   logs bot` says why (usually a mistyped token).
5. **Invite the bot** (the link is in [step 1](#1-create-the-discord-application) and on the setup site) and run
   `/setup` in your server ([step 4](#4-set-up-each-server)).

Tip: add `COMPOSE_FILE=docker-compose.prod.yml` and `COMPOSE_PROFILES=https` to `.env` and the commands below
shorten to plain `docker compose …`. The examples assume you have.

| To… | Run |
|---|---|
| Follow the logs | `docker compose logs -f bot` (or `web`, `caddy`) |
| Update to the latest version | `git pull && docker compose up -d --build` (migrations and commands are handled on start) |
| Back up the database | `docker compose exec -T postgres pg_dump -U dq -Fc dq > dq-$(date +%F).dump` |
| Restore a backup | `docker compose stop bot web`, then `docker compose exec -T postgres pg_restore -U dq -d dq --clean --if-exists < dq-2026-01-31.dump`, then `docker compose up -d` |
| Stop everything | `docker compose down` (the data stays in the `pgdata` volume; `down -v` would delete it) |

A nightly backup with cron (`mkdir backups`, then `crontab -e`), keeping two weeks:

```
15 3 * * * cd /path/to/discord-quests && docker compose exec -T postgres pg_dump -U dq -Fc dq > backups/dq-$(date +\%F).dump && find backups -name 'dq-*.dump' -mtime +14 -delete
```

Copy backups off the server too. Notes:

- **Postgres isn't reachable from outside.** No database port is published; only the stack's own containers can
  connect.
- **`POSTGRES_PASSWORD` is only read when the database is first created.** To change it later, run
  `ALTER USER dq PASSWORD '…'` via `docker compose exec postgres psql -U dq`, then update `.env` and
  `docker compose up -d`.
- **Already running a reverse proxy** (nginx, Traefik, Cloudflare Tunnel)? Leave out the `https` profile and point
  your proxy at `127.0.0.1:3000`, passing the original `Host` header (nginx: `proxy_set_header Host $host;`) or the
  setup page will refuse its own forms. `WEB_PORT=0.0.0.0:3000` in `.env` publishes the page on every interface
  instead.
- **Without a domain**, for a trial on your own machine: leave out the `https` profile and set
  `WEB_BASE_URL=http://localhost:3000` (and that redirect in the Developer Portal). Sign-in works on localhost only.
- **Never scale the bot** (`--scale bot=2`): two bots would both answer every button.

## Deploying elsewhere

Ready-made configs: [`render.yaml`](../render.yaml) (Render Blueprint: database, bot and setup page),
[`deploy/fly/`](../deploy/fly) (Fly.io: one app each for the bot and the setup page) and
[`deploy/railway.md`](../deploy/railway.md). All of them build the same `Dockerfile`.

- **Run exactly one bot.** It holds the Discord gateway connection and the round timers. The setup page can scale
  freely.
- **Same `MASTER_KEYS` everywhere.** The bot decrypts the keys the setup page saved.
- **Logs** are one JSON object per line when `NODE_ENV=production` or `LOG_FORMAT=json` (time, level, message,
  campaign and round ids). API keys and tokens are redacted before anything is written.

## Backups and keys

- Use a managed Postgres with daily backups and point-in-time recovery, or schedule
  `pg_dump --format=custom "$DATABASE_URL" > discord-quests-$(date +%F).dump` and keep copies off the server.
  Restore with `pg_restore --clean --if-exists -d "$DATABASE_URL" <file>`.
- Back up `MASTER_KEYS` separately from the database (a password manager is fine). Without them, saved API keys
  can't be decrypted; servers would need to enter their keys again, but no game data is lost.
- **Rotating the master key:** put a new key first, keep the old one after it
  (`MASTER_KEYS=v2:<new>,v1:<old>`), deploy, then run `pnpm --filter @dq/db rotate-keys`. It re-encrypts every
  saved API key and sign-in token with the new key in one transaction. Afterwards remove the old key and deploy
  again.

## Hosting notes

- Any container host works (Railway, Fly.io, Render, a small VPS). One bot process comfortably serves thousands
  of servers.
- Use a managed Postgres with backups. Campaign history is append-only; `/campaign delete` purges a campaign
  completely.
- Round timers are restored from the database after restarts.
