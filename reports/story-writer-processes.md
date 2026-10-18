# Story writer: real processes and containers

Run on 2026-10-18 on `feature/story-writer`, beside the scripted stress test in
[story-writer-stress.md](story-writer-stress.md). No real AI service was available here (no key is set), so the
AI calls went to the local stand-in that `pnpm play --ai mock` uses: a server speaking the OpenAI chat API, slowed
down so a kill lands in the middle of a call. The calls went through the real provider code: the provider store,
the gateway, the OpenAI-compatible adapter, the safe fetcher, budgets and logs.

## Setup

- A fresh Postgres database.
- `pnpm play --ai fake --no-writer --auto 6` played turns and queued chapter plans.
- The local server's AI jobs were pointed at the stand-in, which took 4–8 s per answer for the kill test and 35–45 s
  for the shutdown test.
- Each writer ran as `node --import tsx apps/bot/src/writer.ts` (as in the Docker image), with
  `LOG_FORMAT=json`. Signals were sent to the node process itself.

## A writer killed outright (`kill -9`)

| Time (UTC) | What happened |
|---|---|
| 16:49:37 | Writer A claims chapter 2, saves `facts`, starts the `draft` call. |
| 16:49:45 | `kill -9` on writer A. The job stays `running` under A's lease, with `facts` saved. |
| 16:49:59 | Writer B starts. It leaves the job alone while A's lease holds. |
| 16:51:38 | The lease has run out: B logs `writer job claimed`, `attempt: 2`, `resumeAfter: ["facts"]`. |
| 16:51:46 | `writer step done`, `draft`. |
| 16:51:52 | `writer step done`, `revise`; `writer job done`. |

- `facts` was not run again, and the AI was asked for the draft once more (the call A died in) and nothing else.
- The stand-in counted the call A was waiting on as abandoned when A died.
- One chapter plan per campaign and chapter: no duplicates.

## A writer stopped (`SIGTERM`) in the middle of a step longer than its grace

| Time (UTC) | What happened |
|---|---|
| 16:52:37 | Writer B claims chapter 1 of a new campaign, saves `facts`, starts a 35–45 s `draft` call. |
| 16:52:49 | `SIGTERM`: `received SIGTERM, shutting down`. |
| 16:53:14 | After its 25 s grace: `writer job released`. The process exits 25 s after the signal. |
| | The job is back to `queued`, `attempts: 0`, `facts` kept. |
| 16:53:25 | Writer C starts and claims it at once: `attempt: 1`, `resumeAfter: ["facts"]`. |
| 16:54:47 | `draft` and `revise` done; `writer job done`. |

- The handed-back try didn't count against the job's tries.
- The stand-in counted B's `draft` request as abandoned: shutdown cancelled the AI call instead of leaving it
  running and paid for.

## In a container

- `docker compose -f docker-compose.prod.yml up -d postgres migrate writer`, with an `.env` from `.env.example`
  (dummy Discord values, a generated `MASTER_KEYS`).
- `migrate` ran (`migrations applied`) and exited. Then `writer` started (`story writer started`) and reported
  healthy, with `/healthz` returning `{"ok":true,"busy":[]}` on port 8080.
- The process tree was Docker's init, then `docker-entrypoint.sh`, then node.
- `docker compose stop writer` delivered SIGTERM. The writer logged `received SIGTERM, shutting down` and exited
  with code 0 straight away (it was idle).
- **Sandbox limit:** this sandbox's network policy doesn't allow Debian's package servers. So the image was built
  from a copy of the Dockerfile without its one `apt-get` step (fonts for the map renderer, which the writer doesn't
  use) and with the sandbox proxy's certificate added. Everything else in the Dockerfile, and the compose file
  itself, ran unchanged.

## Found and fixed during these runs

- The writer's log lines carried the chapter as `key`, and the log redaction hides any field named like a key, so
  every line read `"key":"[redacted]"`. The field is now `chapter`.

## Also checked

- `pnpm writer:stress` with `NODE_OPTIONS=--trace-deprecation`: passed, and pg's "client is already executing a
  query" warning no longer appears (it did once in the first run, from restore points querying a transaction
  several times at once).

## Not yet done

- **A real AI service:** no key is set in this environment. With `OPENAI_API_KEY` or `GEMINI_API_KEY` added, run
  `pnpm play --ai env` for a few rounds and the first chapter plan, and record the `ai call` lines.
