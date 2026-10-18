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
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Optional server defaults for the story AI, tried in that order. OpenAI and Gemini also paint scene images. Servers can bring their own keys |
| `DEFAULT_DAILY_BUDGET_USD`, `DEFAULT_DAILY_IMAGE_CAP` | Caps on server-default keys per Discord server per day (defaults: $5, 30 images) |
| `ALLOW_PRIVATE_ENDPOINTS` | `true` lets servers use AI running on your own network (Ollama, LM Studio, Automatic1111) |
| `LOG_FORMAT`, `LOG_LEVEL` | `json` or `pretty` (default: `json` in production); `info` (default), `warn`, `error` or `silent` |
| `LOG_AI_OUTPUT` | `true` also logs every AI answer in full, with any reasoning the service sent back. Off by default |

Without any AI configured, every turn goes to the campaign's DM room with the dice, the decisions and the scene,
for a person to tell.

## 3. Run

```sh
pnpm install
docker compose up -d postgres          # or point DATABASE_URL at a managed Postgres
pnpm --filter @dq/bot start            # applies migrations, registers slash commands, connects to Discord
```

And the story writer, which writes chapters ahead of the table (see [The story writer](#the-story-writer)):

```sh
pnpm writer                            # health check on http://localhost:8081/healthz
```

Slash commands are registered every time the bot starts (instantly in one server with `DISCORD_DEV_GUILD_ID`,
otherwise globally). `pnpm --filter @dq/bot register` does it by hand; `REGISTER_COMMANDS=false` skips it.

And the setup page, in another terminal:

```sh
pnpm web:build && pnpm --filter @dq/web start   # or `pnpm web:dev` while developing
```

To run everything in Docker on a server, see [Deploying with Docker Compose](#deploying-with-docker-compose).

The bot serves a health check at `http://localhost:8080/healthz` (the writer on 8081, so both can run on one
machine); the setup page listens on port 3000. With Docker, leave `HEALTH_PORT` out of `.env`: the image sets 8080,
which its health check expects.

### Playing without Discord

`pnpm play` runs the game in a terminal: no Discord application, no bot token. You play every hero, and you're the
DM room too: drafts and turns the storyteller couldn't tell come to you, and the story writer's notices appear as
`[DM room]` lines. It needs Postgres (`DATABASE_URL`, or `postgres://dq:dq@localhost:5432/dq`) and creates a new
campaign each run.

```sh
pnpm play                                          # the scripted storyteller; no AI service needed
pnpm play --ai mock --slow 1-3                     # the same story through the real provider code, 1-3 s a call
pnpm play --ai env                                 # the AI keys in the environment (OPENAI_API_KEY, ...)
pnpm play --ai zai                                 # any listed service, its key in ZAI_API_KEY (and so on)
pnpm play --ai http://localhost:11434/v1 --model llama3.3    # a self-hosted OpenAI-compatible service
pnpm play --help                                   # every option, and every service's id
```

Type a choice's number, your own words, or `pass`; in a fight a number picks a battle action. `/sheet`,
`/journal`, `/jobs` (the story writer's jobs for this campaign), `/rewind N`, `/help` and `/quit` work at any
prompt. At the DM prompt: `o` sends a draft as it is, `e` edits it, `r` asks the storyteller again with your
guidance; for a turn the storyteller couldn't tell, `w` writes it.

| Option | |
|---|---|
| `--ai <service>` | Any service in the presets list (`openai`, `zai`, `gemini`, ...; `--help` lists them), with its own models per job. |
| `--model <id>` | One model for every job instead of the service's choice per job. |
| `--base-url <url>` | Another address for the service. `<SERVICE>_BASE_URL` (`ZAI_BASE_URL`) in `.env` does the same. |
| `--key-env NAME` | Read the key from this variable instead of `<SERVICE>_API_KEY`. |
| `--heroes "Wren:lanternkeeper,Bram:shieldheart:quick-way"` | The party: name, class and path (default: Wren, a Lanternkeeper on the Long Road). |
| `--mode assist` | Every turn comes to you as a draft first. |
| `--intensity light\|classic\|epic` | How dark the story may get. |
| `--resume <campaign id>` | Carry on an earlier session (the id is printed at the end). |
| `--auto N` | Play N rounds without asking: the first choice or an attack, every draft approved. |
| `--transcript file.md` | Save the session. |
| `--log file` | The JSON log lines (every `ai call`, `turn resolved`, `writer job ...`). |
| `--no-writer` | Leave the story writer out, for example to run `pnpm writer` beside it. |
| `--seed x` | Dice that replay the same way. |
| `--db <url>` | Another database. |

`--ai mock` starts a local stand-in that answers like an OpenAI-compatible service with the scripted story, and
points the local server's jobs at it, so calls go through the provider store, the gateway, the adapter, budgets
and logs, just not a real model.

`--ai <service>` sets the local server up the way the setup page would: that service for every job, with its own
models and settings. Its key is read from `<SERVICE>_API_KEY` (`ZAI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`,
...) or the variable `--key-env` names, never from the command line, and is stored encrypted with `MASTER_KEYS`,
like a key added on the setup page. So `MASTER_KEYS` must be set (`.env.example` shows how to make one), and the
same value lets `pnpm writer` read the key if you run it beside. The address is the presets list's own unless
`<SERVICE>_BASE_URL` (`ZAI_BASE_URL`, ...) or `--base-url` gives another: one on a hosted service's host (any path)
is reached like that service, and any other (your machine, a proxy) like a self-hosted one. `--ai <url>` points
every job at your own OpenAI-compatible endpoint; it sends a key only if `--key-env` names one.

```sh
# .env
ZAI_API_KEY=...
ZAI_BASE_URL=https://api.z.ai/api/paas/v4
```

Z.ai's GLM Coding Plan endpoint is for its supported coding tools under Z.ai's terms; its pay-as-you-go API (the
presets list's address) is the one for apps like this.

### The setup page

Anyone with **Manage Server** on a Discord server can sign in and, for that server:

- add **story services** (OpenAI, OpenRouter, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, Z.ai, Gemini,
  Anthropic, Ollama, LM Studio, vLLM, or any custom OpenAI-compatible endpoint), each showing what its docs say
  about every model and how the bot sets its reasoning, and **picture services** (OpenAI, Imagen,
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

### Story settings

Right after `/campaign new`, the host gets a private **Shape your adventure** card (and `/campaign story` brings it
back any time, for the host, the DM or a guardian). The premise and topics are behind its **Premise & topics…**
button; a premise can also be pasted straight into `/campaign story premise:…`.

| Setting | Choices |
|---|---|
| How dark it can get | **Light**: a fireside tale; mild peril, foes run off or are caught, nobody dies. **Classic**: like The Hobbit; real danger and menace, fierce battles, foes and side characters can fall, loss and grief, never gory. **Epic**: like The Lord of the Rings; war, truly menacing villains, sacrifice and slow dread. |
| Storyteller voice | Fireside, Classic storybook, or Cinematic |
| Humor | Plenty, some, or rare |
| Picture style | Classic book illustration, painterly fantasy, storybook watercolor, or your own words |
| Premise & topics | An optional premise that colors names, mood, villains and motifs (the map and main story stay), topics to leave out entirely, and topics to keep offscreen |

**Hard limits at every setting:** nothing grotesque (no gore, wounds in detail, body horror or torture), nothing
sexual, and dark magic only as a threat shown through its effects, never its rituals or methods. No profanity,
self-harm, drugs or drunkenness, and heroes are never killed (at 0 hit points they're Dazed). These are given to
every AI job, checked word by word, reviewed by the story AI each turn at Classic and Epic, and kept out of every
picture.

On a family campaign only a guardian (`/campaign guardian`) can choose Epic, and without one it plays at Classic.
Teen campaigns can choose Epic freely. Campaigns made before story settings existed keep their old, gentler feel
(Light) until someone changes them. Server-wide defaults for new campaigns are on the setup page's **Settings &
budget**.

Players describe their heroes in the hero wizard or later with `/character describe`. The narrator uses those
descriptions, and each hero gets a short appearance card that's reused in every picture so they look the same
from scene to scene.

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
with the scene's name. Scenes told by the AI are painted from its own picture notes; scenes without picture notes, from
the world's description of the place. Pictures count against the server's daily picture limit.

Going back to a place shows the picture the campaign already has of it instead of painting a new one (decisive
moments always get their own, and road pictures only stand in for the same road), so places keep one look and the
picture service isn't asked twice. `/campaign gallery` lets anyone page through a campaign's pictures privately,
each with its scene, place and chapter, and share one with the table. `search:` finds pictures by place name or by
words from the scene's story and picture notes ("bridge" finds the misty crossing; "bells" finds "bell"), using
Postgres's built-in text search.

Pictures are stored in the database (`image_assets`, as the picture service returned them, usually PNG) with the
prompt they were painted from, and each scene points at its picture (`scenes.image_asset_id`). Back up the database
and you've backed up the pictures.

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

### When the storyteller can't tell a turn

The AI is the storyteller. Nothing stands in for it: there is no canned or engine-written narration. When it can't
tell a turn (no story service set for the Storyteller job, the daily budget used up, the service down or returning
errors, or its passages repeatedly turned back by the content reviewer), or when it couldn't read what a player
typed, the turn goes to a person in the DM room:

- The bot posts it to the campaign's DM screen, or to the DM room itself for campaigns without one, and pings the
  DM (or the host).
- It holds everything needed to tell it: why the storyteller couldn't, the scene and its goals, what each hero did,
  every dice roll already rolled, what's already settled (the fight, the decisive moment, what may be found, and
  whether the scene closes and where the story goes next), and the hidden hand's notes.
- **Tell this turn** opens a form for the narration and the players' next choices. **Ask the storyteller again**
  tries the AI once more, for when it was only down for a moment. Players see nothing until it's sent, and the
  table is told a person is telling this turn.
- The host, the DM or a guardian can take it. The campaign's opening is handed over the same way, and the
  adventure starts once it's told.

A scene ends when its story does: the storyteller judges when what the scene is about has been settled and the
heroes are moving on, or the players choose to leave. A failed roll changes the situation but doesn't end the
scene. There's no turn limit.

### The story writer

Deep story work never holds up a turn. A separate service, the story writer, writes it ahead of the table in the
background:

- **Each chapter's plan**: notes for every scene of the chapter, tailored to what these heroes did, the promises
  they made and the people they met, and the characters to bring back. The writer drafts the plan, then reads its
  draft again against what has happened and the content rules. Chapter 1 is written when the adventure starts;
  each later chapter once the one before it is half played, so it's ready before the heroes get there. A plan
  shapes the scenes of its chapter from the moment it's ready.
- **Each chapter's recap**, for the journal and the storyteller's memory, from every turn of that chapter.

Turns only add jobs to its queue (in Postgres) and go on at once. If the writer is busy or down, play goes on:
scenes just have no chapter notes yet, and recaps arrive late.

The DM room hears what it's doing: `📝 Writing chapter 3 ahead of the table.`, then `✅ Chapter 3 is ready`. If a
job fails, it tries again after 1, 4 and 16 minutes, and the DM room is told why each time (recaps are quiet
unless they fail). After the last try it gives up and the notice has a **Try again** button for the host, a DM or
a guardian. A job stopped by the server's daily spending limit waits for the next day without using up a try.

- **Its own job on the setup page:** "Story writer" under Who does what. A slow, strong model is fine here, since
  nobody waits for it. Until it's set, it uses the Planner's service; recaps use the Chronicler's.
- **Restarts lose nothing.** Each step of a job is saved as it finishes. On a deploy the writer gets up to 25
  seconds to finish the step under way, then hands the job back; if it crashes, another writer takes the job over
  after 2 minutes. Either way the next one carries on from the last saved step.
- **Limits:** a job may use up to `WRITER_JOB_TOKENS` tokens (200,000 by default; a chapter plan takes a few
  thousand) and 30 minutes per try. Every call counts against the server's daily spending limit like any other.
- **More than one:** `WRITER_WORKERS` (default 1) runs that many jobs at once, and you can run several writer
  services. Two jobs never run for the same campaign at once.
- **Rewinds:** what was asked for in turns that a rewind undid is set aside, and asked for again when play gets
  there.
- The hidden-hand page on the setup site (behind its spoiler warning) lists each campaign's recent jobs, with how
  long they took, the tokens they used and any error.

### DM room tools: rewinding, fixes and fight rules

When a turn goes wrong (a bug, a fight that should never have happened), the host, a DM or a guardian can put
the game back as it was. This works **only in the DM room** (or a DM screen thread inside it), so nothing shows at
the table until it's done, and it works in AI-DM campaigns too.

Mention the bot there and say what you need, for example `@Discord Quests rewind 2 turns, the wolf fight was
bugged`. The bot replies with a card:

- **Go back to…** lists the last ten turns the story can return to, with each hero's hit points at that moment.
  Pick one and confirm. If your message said how many turns, it goes straight to the confirm step. If you run more
  than one campaign, name it in the message.
- A rewind restores each hero's hit points, conditions, spell slots, level and gold, their packs, quests,
  promises, the people and places they know, the scene they were in, and the choices in front of them. The undone
  turns stay in the history, marked as rewound, and the storyteller forgets them. The table gets a short note
  and the scene again.
- **Mend the party** puts everyone back to full health, clears conditions and rests their spells. **Rebuild this
  fight** draws the fight in progress again, balanced for the party as it stands. Both work at any time, including
  in campaigns from before restore points existed: restore points are saved from the first turn played after the
  update that added them.
- **Fight rules** switches the new fight rules on or off. New campaigns start with standard SRD rules. With the new
  rules on:
  - A hero's attack (weapon or spell) that misses by 1 or 2, and isn't a natural 1, grazes for the attack's ability
    modifier. An attack that does nothing earns ✨ Courage: on the hero's next miss the bot rerolls it for them,
    and the new roll stands.
  - Every foe has a weak spot. Besides its armor class it has Fortitude, Reflex and Will, set from its armor
    class by its stats: its weakest pair of abilities 2 below, the middle one equal, the strongest 2 above.
    Attacks still go against armor. What a hero tries in their own words is matched against the defense it works
    on: shoving or tackling (Strength) against Fortitude, feints and tricks (Dexterity, Intelligence) against
    Reflex, scaring or taunting (Wisdom, Charisma) against Will. The hero rolls the skill the bot picks. Past
    Fortitude the foe is knocked prone until it gets up on its turn; past Reflex the next attack on it has
    advantage; past Will it's frightened until the end of its next turn, and a skittish foe runs. An idea that
    needs no roll is part of the story but doesn't affect the foe. Nothing picks the weak spot for the players:
    the storyteller hints at it in the story, and choosing well is up to them.
  - Foes' attacks and misses stay as the SRD has them.

  The change applies from the next round, and the table gets a short note saying what changed. The research
  behind it is in `docs/research/combat-miss-rules/`.

The bot reads only messages that mention it. It needs no extra permissions or intents switched on in the
Developer Portal.

## Deploying with Docker Compose

`docker-compose.prod.yml` runs the whole thing on one server: Postgres, the bot, the story writer, the setup page
and, optionally,
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
   | `OPENAI_API_KEY` or `GEMINI_API_KEY` | Optional: a server-wide default for the story AI |

   `DATABASE_URL` is ignored here; the stack builds its own from `POSTGRES_PASSWORD`.
3. **Start it:**

   ```sh
   docker compose -f docker-compose.prod.yml --profile https up -d --build
   ```

   The first build takes a few minutes. Postgres starts, the database is migrated, then the bot, the story writer
   and the setup page start. The bot registers its slash commands, and Caddy fetches an HTTPS certificate for
   `DOMAIN`.
4. **Check it:** `docker compose -f docker-compose.prod.yml ps` shows `bot`, `writer` and `web` as healthy, and
   `https://quests.example.com/guide` opens. If the bot isn't healthy, `docker compose -f docker-compose.prod.yml
   logs bot` says why (usually a mistyped token).
5. **Invite the bot** (the link is in [step 1](#1-create-the-discord-application) and on the setup site) and run
   `/setup` in your server ([step 4](#4-set-up-each-server)).

Tip: add `COMPOSE_FILE=docker-compose.prod.yml` and `COMPOSE_PROFILES=https` to `.env` and the commands below
shorten to plain `docker compose …`. The examples assume you have.

| To… | Run |
|---|---|
| Follow the logs | `docker compose logs -f bot` (or `writer`, `web`, `caddy`) |
| Update to the latest version | `git pull && docker compose up -d --build` (migrations and commands are handled on start) |
| Back up the database | `docker compose exec -T postgres pg_dump -U dq -Fc dq > dq-$(date +%F).dump` |
| Restore a backup | `docker compose stop bot writer web`, then `docker compose exec -T postgres pg_restore -U dq -d dq --clean --if-exists < dq-2026-01-31.dump`, then `docker compose up -d` |
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
- **`service "migrate" didn't complete successfully`:** `docker compose logs migrate` says why. Usually Postgres
  refused the password because `POSTGRES_PASSWORD` in `.env` isn't the one the database was created with: put that
  one back, or `docker compose down -v` to start afresh (deleting its data). The local development file
  (`docker-compose.yml`) is a separate project, `discord-quests-dev`, with its own database.
- **Already running a reverse proxy** (nginx, Traefik, Cloudflare Tunnel)? Leave out the `https` profile and point
  your proxy at `127.0.0.1:3000`, passing the original `Host` header (nginx: `proxy_set_header Host $host;`) or the
  setup page will refuse its own forms. `WEB_PORT=0.0.0.0:3000` in `.env` publishes the page on every interface
  instead.
- **Without a domain**, for a trial on your own machine: leave out the `https` profile and set
  `WEB_BASE_URL=http://localhost:3000` (and that redirect in the Developer Portal). Sign-in works on localhost only.
- **Never scale the bot** (`--scale bot=2`): two bots would both answer every button. The writer may be scaled.

## Deploying elsewhere

Ready-made configs: [`render.yaml`](../render.yaml) (Render Blueprint: database, bot, story writer and setup page),
[`deploy/fly/`](../deploy/fly) (Fly.io: one app each for the bot, the story writer and the setup page) and
[`deploy/railway.md`](../deploy/railway.md). All of them build the same `Dockerfile`.

- **Run exactly one bot.** It holds the Discord gateway connection and the round timers. The setup page and the
  story writer can scale freely.
- **Same `MASTER_KEYS` everywhere.** The bot and the story writer decrypt the keys the setup page saved.
- **Logs** are one JSON object per line when `NODE_ENV=production` or `LOG_FORMAT=json` (time, level, message,
  campaign and round ids). API keys and tokens are redacted before anything is written. See
  [Reading the logs](#reading-the-logs).

### Reading the logs

Each turn writes these lines (with Docker Compose: `docker compose logs bot`):

- **`ai call`**, one per AI request: `task` (narrator, judge, intent, safety, summarizer, writer), `model`,
  `provider`, `ms`, `inputTokens`, `outputTokens`, `effort` and `maxOutputTokens` as sent (the answer limit, only
  when one is set for the job or the model), `expectTokens` (the job's usual answer size, for the budget), and, when
  the service
  reports them, `cacheReadTokens`, `reasoningChars` and `reasoningTokens` (how much of the answer was thinking) and
  `serverTimings` (llama.cpp's own `prompt_ms`, `predicted_ms`, `cache_n` and the rest). A request that fails is an
  **`ai call failed`** warning with its `stop` (`error` for a timeout or an outage, `invalid`, `max_tokens`...) and
  the service's `error`. When one service fails and another is set for the job, a **`provider failed, trying next
  route`** warning follows, and the next service gets its own `ai call` line.
- **`narrator unavailable`**, **`reviewer unavailable`** and **`narration rejected`** (with the `problems` sent
  back to the storyteller), each with its `attempt`, and **`narration handed to a person`** (with the `reasons`)
  when the storyteller couldn't tell the turn.
- **`turn resolved`** (a turn that went out), **`turn drafted for the DM`** (an Assist draft) or **`turn handed to a
  person`** (with its `reasons`): `seq`, `mode`, `outcome` (`committed`, `assist_draft` or `handoff`), and where the
  time went: `prepareMs` (the action reader, the dice, the hidden hand, the storyteller and its reviewer),
  `commitMs` (saving, which includes queueing the story writer's jobs) and `totalMs`.
- **`turn posted`**: `resolveMs`, `postMs` (Discord) and `totalMs`, from the round closing to the turn appearing.

Every line logged while a round resolves carries its `roundId`, so one turn's lines can be pulled out together:

```bash
docker compose logs --no-log-prefix bot | grep '"roundId":"<id>"'
```

The story writer (`docker compose logs writer`) writes, each with `jobId`, `kind`, `chapter` and
`campaignId`:

- **`writer job claimed`** with its `attempt` and `resumeAfter` (the steps an earlier try already saved).
- **`writer step done`**: `step` (`facts`, `draft`, `revise`), `ms` and `tokens`. Its AI calls have their own
  `ai call` lines, with `task: "writer"` (or `summarizer` for recaps, and `judge` for the reviewer's read of
  each recap).
- **`chapter recap rejected`** with its `attempt` and the `problems` the content check or the reviewer found. The
  chronicler is asked once more with them; a recap that still doesn't pass fails the step (`writer job failed`), and
  the job is retried.
- **`writer job done`**, or **`writer job failed`** with the `reason` the DM room was given and `retryAt` (none
  when it gave up). **`writer job stale`** when a rewind set it aside, **`writer job lost`** when it stopped being
  this writer's (handed back on shutdown, or taken over), and **`writer job released`** on shutdown.

`LOG_AI_OUTPUT=true` adds an **`ai output`** line after each call with the full `answer` and `reasoning`. Those
lines are long: the Compose file keeps 5 files of 10 MB, so switch it off again once you've seen what you need.

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
