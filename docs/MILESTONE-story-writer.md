# Milestone: `feature/story-writer` ready to merge into `dev`

The branch delivers section 2b of the approved roadmap plan ([ROADMAP.md](ROADMAP.md)). This page lists every item
of 2b with where it stands, then what has to happen before the pull request into `dev` can merge, then what the plan
leaves to `feature/storytelling` (so it's clear what a table will and won't see after this merge).

## 2b, item by item

| Item in the plan | Status | Where |
|---|---|---|
| `spoiler.story_jobs` with kinds `bible \| chapter \| side_quest \| rework \| recap`, reason, status, attempts, lease owner and expiry, heartbeat, step checkpoints, error, timestamps | Done | `packages/db/src/schema/spoiler.ts`; migrations `0008_story_jobs`, `0009_story_job_kinds` (renames older jobs' kinds), both made with `drizzle-kit generate` |
| Claims with `FOR UPDATE SKIP LOCKED`, one running job per campaign | Done | `packages/engine/src/story-writer/jobs.ts` |
| A separate service, `apps/writer`, same image, different command | Done, with one dependency below | `apps/writer/src/main.ts`; `docker-compose.prod.yml`, `render.yaml`, `deploy/fly/writer.toml`, `deploy/railway.md`; `pnpm writer` |
| On shutdown it finishes the step or releases its lease; after a crash it picks up from the last saved step | Done | `story-writer/index.ts`, `runner.ts`; `writer.test.ts`; `reports/story-writer-processes.md` |
| Steps outline → bible → spine → chapter detail → side quests → self-check, each one `structured()` call under the 3-minute cap | Done | `story-writer/story-kinds.ts` (the writer's calls use the usual cap; the 15-minute exception is gone) |
| The engine checks before publishing: ids, content rules, no contradictions with established facts | Done | `checkMaterial` and `withoutPlayed` in `story-writer/material.ts` |
| Publishing writes a new `story_plans` version marked ready | Done | `publishMaterial`; each version is the whole material (`ready: true`); rewinds fall back to the version before |
| 30 minutes and a token ceiling per job, counted against the daily limit | Done | `runner.ts`, `WRITER_JOB_TOKENS`; a budget stop waits for the next day without using a try |
| New AI job "Story writer" in `LLM_TASKS`, the providers' env, `STORY_TASKS`/`TASK_INFO` | Done | `packages/core/src/llm`, `packages/providers/src/env.ts`, `apps/web/src/server/tasks.ts` |
| `defaultModels`/`defaultParams` for the writer in each preset | Done for every preset that names models | `packages/providers/presets/llm/*.yaml` (custom endpoints, Ollama, LM Studio, vLLM and OpenRouter take the model the server picks) |
| Trigger: a campaign is created | Done | `CampaignService.create` queues the whole story |
| Trigger: prepared material runs low | Done | `TurnService.queueWriting`: fewer than two prepared scenes left for the beats still ahead |
| Trigger: the party goes off course (several scenes without touching the spine, or heading somewhere with nothing prepared) | Done | `queueWriting`: three scenes running with nothing prepared for them, or a next scene at a place nothing covers |
| Trigger: a chapter marker is reached | Done | `queueWriting`: the next chapter in full, and the recap |
| Trigger: a DM correction touches material that's already written | Done for DM-told turns | `TurnService.approveDraft`: a turn the DM tells in their own words queues a rework |
| Chapter recaps move into jobs | Done | `story-writer/chapter-recap.ts` |
| DM-room notices: "preparing chapter 3 (about 20 min)", ready, failure with reasons and a retry | Done | `story-kinds.ts` (estimate from the last ten jobs of the kind), `apps/bot/src/writer-notices.ts` |
| The spoiler page lists jobs and material | Done | `apps/web/src/app/servers/[guildId]/campaigns/[campaignId]/loom/page.tsx` |
| Stress test: kill mid-job, several campaigns, budget runs out, turn latency, measured from the pino logs | Done | `pnpm writer:stress`, [reports/story-writer-stress.md](../reports/story-writer-stress.md) |

## Before the pull request can merge

1. **`apps/writer` as its own workspace package.** A package of its own needs `pnpm-lock.yaml` regenerated (pnpm adds
   an importer for it), and the standing rule is that the lockfile isn't changed. Until that's allowed,
   `apps/writer/src/main.ts` runs the writer service from the bot's code, whose dependencies it shares. It's a
   separate process with its own command everywhere it's deployed. **Needs:** your go-ahead to regenerate the
   lockfile for `apps/writer`, or acceptance of the shared entry as it is.
2. **A run against a real AI service.** Everything here ran against the scripted stand-in; no key is set in this
   environment. A real model has to show that its material passes the checks, and that each step answers within the
   3-minute cap. The self-check returns the whole job's material, up to about 6,000 tokens, which is the step most
   likely to run long on a model that always reasons (Z.ai's GLM-5.3 does). **Needs:** `pnpm play --ai <service>`
   with a key, reading the `writer step done` and `writer material rejected` lines.
3. **CI green on the pull request.**

## What the plan leaves to `feature/storytelling`

The plan puts these in 2c. They're listed so it's clear what a table sees after this merge:

- **Scenes framed from the written material.** "The director frames each scene from material that's already
  written" is 2c. Until then scenes still follow the world's chapters. When a scene opens, the storyteller is handed
  the writer's prepared scene for it (situation, question, who's there, clues, temptation). The spine, the endings
  and the side quests shape the writer's own work and the spoiler page, not where scenes happen.
- **Following where the party heads.** With scenes taken from the world's chapters, "heading somewhere with nothing
  prepared" can only see where the world's next scene is, not where the players chose to go.
- **Standing DM corrections** ("Wren is he/him", "move the plot on") from the DM room. They will queue reworks
  through the same entry point a DM-told turn uses now.
- **Established facts kept current turn by turn** (pronouns, who knows what, where everyone is). The writer keeps
  facts in the bible and only ever adds to them; the turn-by-turn upkeep is 2c.
- **The archetype library and generated worlds.** On Lanternreach the spine is written over the world's own
  chapters.
