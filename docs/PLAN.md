# Discord Quests: an AI dungeon master bot (plan)

## Context

The repo `brewer-michael/discord-quests` is empty (branch `claude/charming-hawking-7sk8xi`, no commits). We are building a Discord bot that runs tabletop-RPG campaigns in a new fictional world, for ages 8+. Per campaign it either runs the story itself ("AI-DM" mode) or helps a human dungeon master ("Assist" mode).

**Core experience**
- **Two archetypes.** The noble, longsuffering character does things the right way when that road is long and hard. The shortcut-taker gains quick advantages by cheating or by giving something up for power. Kept kid-safe: trading away keepsakes, trust or promises, or striking bargains with a trickster fox. Never blood or self-harm.
- **The hidden "Swift Sure Hand."** Players never see it. Mercy, honesty, patience and keeping promises quietly plant threads. Late in the game, when the enemy is winning and success is numerically impossible, the enemy's plan falls apart in just the right way because of one of those earlier choices. The model is Frodo failing at the fire and Gollum, once spared out of pity, finishing it. Players may only sense afterwards that something beyond their own will tipped the balance.
- **A plot that adapts to player decisions.** Stats are tracked automatically, and the bot generates scene art when players enter a new area or challenge.

**Decisions made with the user**

| Area | Decision |
|---|---|
| Language | TypeScript (ESM, strict), Node 22, discord.js v14.19+ with Components V2 |
| Rules | D&D 5e-style from SRD 5.2.1 (CC-BY-4.0, mechanics only). Guided mode lets novices pick story options that raise the stats for them |
| AI providers | Story and image AI both configurable on a web setup page: many presets plus custom endpoints. Claude is the default story AI |
| World | Hand-written starter world in editable YAML/Markdown files; the AI fills in details |
| Hosting | Cloud: Docker images plus managed Postgres (Neon, Supabase or RDS; Railway, Fly or Render) |

**Age and legal note (goes in README and `/privacy`).** Discord requires users to be 13 or older. Players aged 8–12 play family-style, through a parent's or guardian's account or at the same physical table; Assist mode with a human DM is recommended. The bot stores no names, ages, emails or locations, only Discord IDs. Get a legal review before marketing to under-13s (COPPA), and check each AI provider's policy on minors.

---

## Architecture

### Monorepo (pnpm workspaces)

```
packages/core        PURE TS, no I/O and no SDKs. Clock and RNG are injected.
  rng/  rules/  srd/  loom/  story/  deltas/  safety/  prompts/  pipeline/  world/
packages/providers   LLM and image adapters, presets/*.yaml, registry, safeFetch (SSRF guard), pricing, fake adapters
packages/db          Drizzle schema (public / spoiler / loom pg-schemas), migrations, repos, AES-GCM crypto
packages/engine      Campaign/Round/Turn/Combat/Approval/Director/Image/Budget services, pg-boss jobs
packages/map-render  @napi-rs/canvas world map with fog of war and party marker
apps/bot             discord.js client, commands, interaction router, Components V2 renderers, worker, /healthz
apps/web             Next.js (App Router) setup page with Discord OAuth (Better Auth; Auth.js v5 as fallback)
apps/sim             Terminal simulator: interactive, scripted, Monte Carlo and replay modes, no Discord needed
worlds/lanternreach  Starter world (placeholder name, renameable)
tools/               register-commands, world-validate, gen-json-schemas, seed-dev
```

**Supporting tools:** zod v4 (world files, LLM outputs, env, forms), Biome (lint/format, and it enforces that only `engine/src/loom` and the web loom page import `@dq/db/loom`), Vitest, fast-check, MSW, PGlite and Testcontainers, Playwright, pg-boss (Postgres-backed jobs, no Redis), and docker-compose for local Postgres.

### Data model (Postgres, three visibility tiers)
- **`public`**
  - Tenancy and config: guilds, OAuth tables, `provider_configs`, `secrets` (AES-256-GCM, AAD bound to the row, rotating `MASTER_KEYS`), `task_routes` (per-task provider, model and failover chain), `usage_ledger`/`usage_daily` (cost caps), `audit_log`.
  - Campaign snapshot: `campaigns`, `campaign_members`, `characters`, `inventory_items`, `character_advancements`, `npcs`, `campaign_regions`, `quests`, `promises`, `canon_entities`, `scenes`, `rounds`, `pending_actions`, `chapter_summaries`.
  - Append-only log: `turns` (stage checkpoints, RNG keys, recorded LLM outputs) and `events`. A DB trigger blocks UPDATE/DELETE except in the purge path.
  - Plus `approval_requests`, `image_assets` (cache), and `safety_events` (stores hashes, never text).
- **`spoiler`** (DM and director only): `story_plans` (versioned beats), `faction_clocks`, `npc_secrets`.
- **`loom`** (hidden): `campaign_secrets` (32-byte master seed, tuning, cooldowns), `deeds`, `threads`, `snares`, `plans` (quiet-hand detours), `bearers`, `evaluations` (audit and why-not), `ledgers` (per-character grace, debt and path affinity).

### Turn pipeline (pure stages in `core/pipeline`, orchestrated by `engine/TurnService`)
Each stage is checkpointed on the draft `turns` row, so a crash resumes without re-rolling dice or re-calling the AI. Only one turn per campaign runs at a time (campaign lease plus `FOR UPDATE`).

1. **Capture input.** A choice button, the "Something else…" modal, `/act`, `/say`, or a combat button. The bot defers within 3 s and deduplicates by interaction id.
2. **Collect the round.** It resolves when everyone has acted, the timer expires (2–5 min live, 12–24 h play-by-post), or the host clicks "Resolve now".
3. **Safety check on input, in parallel with step 4.** A local lexicon (`obscenity`) and PII regex run first, then a structured AI classifier. If the classifier errors or refuses, the input is blocked with a gentle message.
4. **Parse intent** (free text only) with a structured output that includes deed candidates and an `isMetaQuestion` flag. Meta questions about luck, odds or secrets get a deterministic in-character deflection, with no AI call.
5. **Resolve rules** (pure, `rules` RNG stream): checks, DCs, advantage, combat and conditions. Crux beats also compute an exact `pSuccess`.
6. **Evaluate the loom** (pure, separate `loom` RNG stream). Returns mutations, narrator directives, director constraints, and outcome overrides. It never changes the dice.
7. **Narrator call.** One call per round, single-turn, rebuilt from state. The world-bible system block is cached for 1 h. The structured output includes narration, NPC lines, proposed deltas, advisory virtue/shortcut tags, 2–4 choices, scene change plus image brief, and significance.
8. **Validate deltas** (`core/deltas`). HP must match the rules engine. Items only from the scene loot pool. XP only from core. Thread-bearers can't be killed (they flee instead). Moves only along adjacent map edges. One repair call is allowed, then template narration.
9. **Output checks.** Lexicon, leak checker, reading level (warn only), `allowedMentions: {parse: []}`.
10. **Mode branch.** AI-DM commits directly. Assist posts the draft to the DM's private thread to Approve, Edit, Regenerate, or Reject and write their own.
11. **Apply in one transaction:** turn, events, snapshot, loom mutations, `turn_seq++`, and jobs enqueued in the same transaction.
12. **Render** as a Components V2 message, and disable the previous turn's buttons.
13. **Async jobs:** `image.generate` (edits the image into the message), `director.replan` (debounced; runs after major decisions or at beat/chapter ends), and `summarize.chapter`.

**Combat** uses initiative (d20 + DEX), per-PC action buttons, a 120 s timeout that defaults to Defend, and a kid-safe enemy AI. Defeat stays gentle: enemies faint, flee or surrender; PCs become "Dazed" and make Rally checks instead of death saves; a total party knockout becomes a capture or rescue scene, never a game over.

---

## The Swift Sure Hand (`packages/core/src/loom`)

**Principles**
1. **Code decides; the AI only describes.** All firing logic is deterministic and seeded. The narrator receives one in-world sentence plus a list of things it must not state.
2. **It scores deeds, not labels.** The Path a player picks is flavour and visible perks. The loom scores what characters actually do, so a Quick Way character who shows mercy still plants threads. Redemption arcs are possible.
3. **Effort still falls short.** A convergence never turns the party's own roll into a success. The party fails, then the world turns.
4. **The way back is always open.** Making amends unknots a snare and turns it into a redemption thread.
5. **Every quiet-hand detour has a purpose.** Each one is registered with a payoff before it is planted.

**How it works**
- **Deeds.** These are qualified on the server from game state, not declared by players: `mercy`, `honesty_at_cost`, `patience` (refusing an offered shortcut), `promise_kept`, `kindness_to_lowly`, `self_sacrifice`, `keepsake_kept`.
  - Weight = `base × costFactor × novelty × sincerity`. A virtue that cost nothing is worth little. Repeats are damped. Exploiting the same target afterwards cuts the weight retroactively. This keeps players from farming virtue.
  - Shortcut deeds (`cheat`, `deceive`, `break_promise`, `fox_bargain`, `trade_keepsake`, `abandon_ally`, `steal`) create snares instead.
- **Threads (seeds).** Each one is anchored to an NPC, item, place or faction.
  - Threads ripen with **story progress**, not elapsed turns: mercy takes about an act but carries heavy weight; kindness takes one or two chapters.
  - States: dormant → ripening → ripe → reserved → woven.
  - Each thread maps to the payoffs it can fill (e.g. mercy+NPC → `spared_one_acts`; kindness → `ally_arrives`; patience+place → `hidden_way`; keepsake → `object_reveals`).
- **Bearers (the Gollum rule).** Any NPC anchoring a live thread must survive; the validator and combat AI make them escape at 0 HP. They are kept nearby: shadowing (glimpses and footprints every 2–4 beats), on their own converging route, or waiting as an ally.
  - The loom gives the director constraints with no reasons attached: `keep_alive`, `schedule_presence`, `need_socket`.
  - Code checks that a bearer reserved for a crux appears in the 1–3 beats before it. If not, it injects a glimpse automatically.
- **Snares (hidden debts).** A shortcut grants a real, visible, bounded benefit right away (from `shortcuts.yaml`), plus a hidden snare with a severity and a due date. Possible effects when it comes due:
  - an ally withholds help at the crux
  - borrowed luck is recalled at a key roll
  - trust is lost
  - the Fox collects a favour
  - the party is forced onto a longer way

  At most one snare per scene. Parties in debt are offered more Fox temptations.
- **Quiet-hand detours.** These happen only at travel or exploration transitions. Conditions: an upcoming beat has an open payoff that a detour template can serve, at least 15 turns have passed, at most one per chapter, and none is pending.
  - The detour is registered with its purpose before it is planted, e.g. "the ford washed out, so take the mill path", which introduces the miller's child who later shows the sluice tunnel into the fortress.
  - If re-planning removes the target beat, the detour is repurposed. Payoff rate must stay at 95% or above in the simulator.
- **Convergence (decisive moments).** The arc includes authored cruxes (`overwhelming_odds`, `race_against_clock`, `hold_the_line`, `last_step`). Faction clocks fill late in the game and raise crux DCs, which is what makes everything seem to work out for the enemy.
  - On a crux **failure**: score eligible threads (`weight × ripeness × socketFit × relevance`), take the top 3, apply ±10% seeded jitter, and compare against `requiredGrace` plus snare pressure.
    - ≥ required → `success_by_convergence`
    - ≥ 60% of required → `costly_success`
    - otherwise → `fail_forward` along the crux's authored branch. The campaign always presses on.
  - Threads used are marked woven; the narrator gets a directive such as "Snibbet lunges for the Ember, slips at the forge's lip, and it falls into the fire."
  - On a crux **success**, players really did it themselves and no threads are spent.
  - **Minor graces:** ≤ 1 per chapter, only on meaningful failures, using low-weight threads not reserved for a crux.
- **Pacing caps.** At most one convergence per crux, at most one minor grace and one detour per chapter, at most one snare effect per scene, and at most two providence events in any 10 turns.
- **Determinism.** `evaluateLoom(input, rng)` is a pure function. Each draw uses `derive(masterSeed, stream, turnSeq, subKey)`. The dice players see (attacks, checks, encounters, `/roll`) are not seeded: they come from the platform's cryptographic generator and are saved with the turn they belong to. Tests and the simulator can pass seeded dice to replay a game. The `loom.evaluations` table records why something fired or didn't. `sim replay` re-runs a campaign against its recorded AI outputs.
- **Leak prevention, layered:**
  1. The narrator sees only directives. The director sees only constraints, never weights.
  2. A branded `PublicSceneView` type, which the loom repo can't produce.
  3. Canary-string tests: hidden fixtures must never appear in any prompt.
  4. An output lexicon for meta terms ("luck score", "karma", "thread", "seed") and causal giveaways ("because you spared").
  5. An AI judge on loom-touched turns, then one regeneration, then template narration.
  6. Deterministic in-character deflections ("Some threads can only be seen from the far side of the tapestry.").
  7. Hidden data never appears in `custom_id` values or on `/character sheet`.
- **Epilogue** (DM toggle): `subtle` (default) hints poetically at up to 3 woven threads with no numbers. `explicit` adds a "Looking Back" recap that names the connections. `off` skips it.
- **Assist-mode controls.** The DM sees `/loom view` (qualitative: seedling, budding, ripe; plus bearers, snares and pending detours) and can use `/loom plant|protect|snare|unknot|trigger`. Engine proposals show up as toggles on the approval draft. Loom mode is `auto`, `manual` or `off`. In AI-DM mode, a spoiler-gated web view is the only window into it.

---

## Providers (`packages/providers`)

- **Interfaces:**
  - `LlmAdapter.generateStructured<T>(req {model, system: PromptBlock[], messages, schema: zod, effort, maxOutputTokens}, cfg, ctx)` returns `{ok, value, usage, servedByModel, fellBack}` or `{ok: false, stop: refusal|max_tokens|filtered|error}`. Also `listModels()` and `test()`.
  - `ImageAdapter.generate(req)` always returns bytes, polling async APIs internally.
  - `ProviderRegistry.resolveRoute(guild, task, campaign?)` resolves campaign → guild → platform default, with a failover chain.
- **Anthropic (default).** Uses the official `@anthropic-ai/sdk`:
  - `client.beta.messages.stream(...).finalMessage()` with `model: "claude-opus-5-5"`, `output_config: { effort, format }` (zod schema via `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`, re-validated with zod), `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
  - `cache_control` with a 1 h TTL on the stable world-bible block.
  - Check `stop_reason` before reading content. Never send `thinking: disabled`, `budget_tokens`, or a forced `tool_choice` (all return 400 on this model).
  - Default routes: **every task on `claude-opus-5-5`**, with effort varying by task (narrator `medium`, director `high`, intent/safety/judge/summarizer `low`). Admins can route cheap tasks to another model on the setup page.
- **OpenAI-compatible adapter** (official `openai` SDK with a custom `baseURL`). Covers OpenAI, OpenRouter, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, Ollama, LM Studio, vLLM, llama.cpp and any custom URL. Structured output falls back in this order: `json_schema` → `json_object` → prompt-only. Results are always zod-validated, with one repair retry.
- **Gemini** via `@google/genai` with a JSON response schema.
- **Image adapters:** OpenAI `gpt-image`, Google Imagen/Gemini image, Stability, Replicate (Flux), fal.ai, OpenAI-compatible `/images/generations`, and **generic HTTP**. The generic adapter uses a logic-less templated JSON body (`{{json prompt}}`) and a minimal `$.a.b[0]` path mapping for URL/base64/polling, so users can point it at Automatic1111, ComfyUI wrappers and similar.
- **Presets** are data files (`presets/llm/*.yaml`, `presets/image/*.yaml`) holding base URL, auth style, capabilities, suggested models and a self-hosted flag. A custom endpoint is a preset of `custom`.
- **`safeFetch` (SSRF guard).** HTTPS only. DNS-resolved private, loopback, link-local and metadata ranges are blocked, with the connection pinned to the validated IP. Redirects are capped and re-validated, and there are body caps and timeouts. `ALLOW_PRIVATE_ENDPOINTS=true` turns the block off for self-hosters. Every request to a user-supplied URL goes through it, including image URLs that providers return.
- **Secrets** are write-only from the UI (shown as `•••• abcd`) and decrypted just in time by the bot or worker. Logs redact them.
- **Cost guards.** `BudgetGuard.reserve()` checks the per-guild daily caps (USD estimate or tokens) and per-day/session/campaign image caps. When narration is out of budget the bot drops to rules-only template narration; when images are out of budget it reuses cached region art.
- **Image cache** is keyed by `sha256(sanitizedPrompt|style|provider|model|size)`. Region establishing shots are reused across campaigns. Images are stored as Postgres bytea, or in S3/R2 if configured.
- **Image prompts never contain raw player text.** They are built only from the narrator's structured `imageBrief`, passed through an allowlist sanitizer, and prefixed with a storybook style ("gentle storybook watercolor, child-friendly, no text").

---

## Discord UX (answers the user's question: yes, TypeScript handles all of it)

- **Install:** Guilds intent only (no MessageContent) and minimal permissions: threads, attach files, embeds, app commands.
- **Commands:**

| Group | Commands |
|---|---|
| Setup and campaign | `/setup`; `/campaign new\|join\|leave\|status\|pause\|resume\|end\|settings` |
| Character | `/character create\|sheet\|levelup\|inventory` |
| Play | `/act`, `/say`, `/pass`, `/roll`, `/rest`, `/xcard` (anonymous content veto) |
| World and memory | `/map`, `/journal` (quests, promises, recaps), `/recap` |
| Assist DM | `/dm narrate\|npc\|roll\|award\|scene\|combat\|hooks`; `/loom ...` |
| Info | `/about` (SRD attribution), `/privacy`, `/help` |

- **One thread per campaign**, with a pinned Hub (roster, Join, Map, Journal). In Assist mode there is also a private "DM Screen" thread for drafts.
- **Turn message** is a Components V2 Container holding, in order:
  1. Scene image (MediaGallery, added by a later edit)
  2. Location heading
  3. Narration
  4. NPC lines as Sections
  5. Roll summary, with DCs shown as Easy/Hard labels for kids
  6. Up to 4 choice buttons plus "Something else…"
  7. Utility buttons: Sheet, Map, Not this
- **Character wizard.** An ephemeral message updated in place on each click. Its state persists in a draft row, so it survives restarts.
  1. Guided or Advanced
  2. Class (select menu with preview)
  3. Path (The Long Road / The Quick Way)
  4. Background and species
  5. Abilities. **Guided:** pick an "Upbringing" (a legal 27-point array), then a "Formative moment" (+2/+1) with a live preview. **Advanced:** six `[−] STR 13 (+1) [+]` rows with a points-left banner and Reset / Recommended. That is about 33 components, under Discord's 40 limit.
  6. Skills (multi-select)
  7. Keepsake (seeds a `keepsake_kept` thread)
  8. Name modal (moderated, "pick a fantasy name, not your real one")
  9. Review and Confirm

  Level-up uses the same pattern, with narrative ASI options such as "Train with the blacksmith" (+1 STR, +1 CON).
- **Map.** `@napi-rs/canvas` draws, in order:
  1. A hand-painted or procedural parchment base
  2. Known roads
  3. A fog layer with discovered regions cut out (`destination-out` with a blurred edge), and rumored regions dotted
  4. Labels
  5. The visited trail
  6. The party token
  7. A compass

  It uses OFL fonts and outputs a cached PNG. A "Focus region" select zooms in, and "Travel to…" becomes the party's action.
- **Family mode** (`/campaign new` asks Family 8+ or Teen 13+). Shows the guardian notice, gives a `guardian` role a safety log (what was blocked, never the text) plus a pause control, and offers hard purge via `/campaign delete`.

## Web setup page (`apps/web`)
- **Access:** Discord OAuth (scopes `identify guilds`), an "Add to server" link, and a guild picker limited to users with MANAGE_GUILD.
- **Providers:** story and image provider forms (preset dropdown or custom endpoint), model picker via `listModels`, a **Test connection** button, and per-task routing with failover.
- **Defaults and spending:** game defaults (mode, content level, image frequency, epilogue style, round timer, loom mode) and budgets with usage charts.
- **Campaigns:** management (archive, export, delete) and a spoiler-gated loom view that requires confirmation and writes an audit entry.
- **Platform defaults:** an optional platform-wide default provider key from env, so guilds can start without their own keys. Guild keys override it.

## Starter world (`worlds/lanternreach/`, placeholder name)
- **Files:** `world.yaml`, `tone.md` (grade 3–5 reading level; conflict as bonk, flee, faint, captured, befriended), `content-rules.yaml`, `classes.yaml`, `paths.yaml`, `backgrounds.yaml`, `species.yaml`, `items.yaml`, `creatures.yaml`, `guided-options.yaml`, `shortcuts.yaml`, `deflections.yaml`, `regions/*.yaml`, `factions/*.yaml`, `npcs/archetypes.yaml`, `arc/act{1,2,3}.yaml` (decisive beats carry crux specs), `providence/{detours,payoffs,epilogue-lines}.yaml`, `map/map.yaml`, `lore/*.md`.
- **Validation:** zod `.strict()` schemas plus `pnpm world:validate`. It checks cross-references, map-edge symmetry, that every crux has 2 or more payoff options and a fail-forward branch, that guided arrays are legal 27-point buys, that every detour serves an existing payoff, and runs a banned-word lint. JSON Schemas are generated for editor autocomplete.
- **Premise:** Hearth-Lanterns hold back the Long Night, and the Gloam King has stolen the Ember that feeds them.
- **Classes** (reskinned SRD): Shieldheart (Fighter), Scout (Rogue), Lorewright (Wizard), Lanternkeeper (Cleric), Wayfarer (Ranger), Songspinner (Bard).
- **Regions:** 10.
- **Factions:**
  - Long Road: Lamplighters' Guild, Wardens of the Old Road, River Folk.
  - Quick Way and antagonists: the Gilded Ledger, the Court of the Bargain Fox, the Gloam Host (shadow critters that pop into smoke).
- **Gollum-pattern NPC:** Snibbet, a wretched lantern-thief who covets the Ember.
- **Arc:** three acts with a crux each. Act I is fully detailed for the MVP (3 chapters, about 12 beats, one crux); Acts II and III are outlined.
- **Rules scope:** "5e-lite": 6 classes, levels 1–10, plus subsets of spells, conditions and creatures. Classes are data-driven, so more can be added. SRD mechanics live in `core/srd/`; worlds hold flavour only. `NOTICE.md` carries the CC-BY-4.0 attribution. No "D&D" trademark use.

**Defaults chosen for open details** (change any of these when approving):
- A character's Path can change at chapter breaks after qualifying deeds (redemption).
- Party size 1–6. Both live and play-by-post timers are supported.
- Fox bargain prices: keepsakes, trust, promises, favours owed.
- `last_step` is used for the final crux only, and the DM can toggle it.

---

## Phases (each one shippable; commit and push per phase)

| # | Phase | Exit criteria |
|---|---|---|
| 0 | Scaffold | pnpm workspace, tsconfig, Biome, Vitest, CI (lint, typecheck, test with Postgres service), docker-compose, env schemas, NOTICE, README with age note |
| 1 | Rules + world | `core/rng`, `rules`, `srd` subset, world schema/loader/validator, Act I content. `world:validate` passes, rules tests pass |
| 2 | Loom + story + sim | `core/loom`, `story` (clocks, cruxes, director contract), `deltas`, fake AI, in-memory `apps/sim` with Monte Carlo report. The riskiest piece goes first |
| 3 | DB + engine | Drizzle schema and migrations, append-only triggers, crypto, repos, TurnService with checkpoints, pg-boss. Sim runs on Postgres |
| 4 | Providers | Anthropic, OpenAI-compatible and Gemini adapters, presets, registry, safeFetch, BudgetGuard, safety/judge tasks. Budget-capped live sim run with Claude |
| 5 | Discord MVP (AI-DM) | Commands, campaign thread and Hub, character wizard, exploration rounds, turn rendering, `/map`, X-card. Providers configured from env |
| 6 | Combat + progression | Initiative, combat UI, enemy AI, gentle defeat, rests, inventory, level-up |
| 7 | Web setup page | OAuth, add-to-server, provider forms, test connection, encrypted keys, routing, defaults, budgets, campaigns |
| 8 | Images | All image adapters plus generic HTTP, sanitizer, cache, storage, async posting, caps |
| 9 | Assist mode | DM Screen approval queue, DM tools, `/loom` commands, web loom view |
| 10 | Story depth | Director re-planning, chapter summaries, epilogue, Acts II–III content |
| 11 | Hardening | Safety and leak eval corpora, observability (pino), backup docs, deploy templates (Fly, Railway, Render) |

**First files to create:** `packages/core/src/loom/engine.ts`, `packages/core/src/world/schema.ts`, `packages/providers/src/types.ts`, `packages/db/src/schema/{public,spoiler,loom}.ts`, `packages/engine/src/turn/turn-service.ts`.

## Verification

- **Unit tests (Vitest):**
  - Dice parser, with chi-square tests on seeded distributions.
  - Modifiers, proficiency, advantage/disadvantage, crits, point-buy legality, every guided option, gentle-defeat paths.
  - Delta validator, table-driven: illegal XP, off-pool items, killing a bearer, non-adjacent moves.
  - Safety lexicon, PII regex, leak checker, prompt snapshots, and the **canary leak test**.
- **Loom property tests (fast-check):**
  - The same seed and inputs always produce the same result.
  - Caps are never exceeded, and woven threads are never reused.
  - Bearers never die.
  - Detours are paid off or repurposed by their deadline.
  - A crux success never spends threads.
  - A convergence never changes recorded dice.
- **Adapters:** MSW or undici MockAgent for every provider, including Replicate/fal polling and generic HTTP mapping. Anthropic tests assert the request shape (`betas`, `fallbacks: "default"`, effort and format, `cache_control` placement, no disabled thinking) and handling of refusals and `max_tokens`. An SSRF suite covers private and mapped IPs, DNS rebinding and redirects. Live contract tests run only with `LIVE=1`.
- **DB integration (Testcontainers Postgres):**
  - Migrations apply.
  - A turn rolls back atomically on an injected failure.
  - Two concurrent resolves produce exactly one winner.
  - Append-only triggers hold.
  - AES-GCM round-trips, and tampering with the AAD fails.
- **Engine integration** (fake AI plus real Postgres): 3 characters play 40 scripted turns to a crux. Assert that a convergence fired, the bearer was present, and no canaries leaked.
- **Simulator Monte Carlo** (small N in CI, large N nightly), with player policies merciful, shortcut, mixed and random. Targets:
  - Merciful parties succeed at the final crux at least 85% of the time.
  - Shortcut parties always get a fail-forward branch.
  - Detour payoff is at least 95%.
  - At most 2 providence events in any 10 turns.
  - Bearers survive 100% of the time.
- **Discord.** Renderer tests check ≤ 40 components, ≤ 4000 characters, `custom_id` ≤ 100 and labels ≤ 80, and snapshot the JSON. Then a manual checklist in a test server:
  - minimal-permission install
  - the wizard on desktop and mobile
  - a 3-player round that times out
  - combat
  - the map
  - the X-card
  - Assist approve, edit and regenerate
  - running out of budget, which should drop to rules-only narration
  - a provider outage triggering failover
  - a restart mid-turn resuming cleanly
- **Web (Playwright, mocked OAuth):** forms work, test connection works, **secrets never appear in HTML or JSON responses**, and the loom page is gated and audited.
- **Every phase:** `pnpm lint && pnpm typecheck && pnpm test` pass before each commit and push.
