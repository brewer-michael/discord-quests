/**
 * `pnpm play`: the game in a terminal, no Discord. You play every hero, and you're the DM room too: drafts and
 * turns the storyteller couldn't tell come to you, and the story writer's notices show up as they would there.
 *
 *   pnpm play                         the scripted storyteller (no AI service needed)
 *   pnpm play --ai mock --slow 1-3    the same story through the real provider code, from a local stand-in
 *   pnpm play --ai env                the AI keys in the environment (OPENAI_API_KEY, GEMINI_API_KEY, ...)
 *   pnpm play --ai zai                any service in the presets list, its key in ZAI_API_KEY (and so on),
 *                                     and another address for it, if wanted, in ZAI_BASE_URL
 *   pnpm play --ai http://localhost:11434/v1 --model llama3.3   a self-hosted OpenAI-compatible service
 *
 * `pnpm play --help` lists every option; docs/RUNNING.md, "Playing without Discord", explains them.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { LlmGateway } from "@dq/core/llm";
import {
  characters,
  connect,
  type Db,
  guilds,
  providerConfigs,
  runMigrations,
  secrets,
  taskRoutes,
} from "@dq/db";
import { encryptSecret, type MasterKey, parseMasterKeys } from "@dq/db/crypto";
import {
  createEngine,
  createLogger,
  type DmDraft,
  type Engine,
  GameError,
  type Logger,
  type ResolveResult,
  StoryWriter,
  seededDice,
  silentLogger,
  type TurnView,
  WorldCache,
} from "@dq/engine";
import { FakeLlm } from "@dq/engine/testing";
import { BudgetGuard, type Preset, ProviderGateway, ProviderStore, preset, presets } from "@dq/providers";
import { and, eq } from "drizzle-orm";
import { battleChoices, formatDraft, formatJournal, formatSheet, formatTurn } from "./play-format";
import { startMockProvider } from "./play-mock";

export interface HeroSpec {
  name: string;
  classId: string;
  pathId?: string;
}

export interface PlayIO {
  /** One line from the player, or null when input has ended. */
  ask(prompt: string): Promise<string | null>;
  say(text: string): void;
}

export interface PlaySessionOptions {
  engine: Engine;
  guildId?: string;
  mode?: "ai_dm" | "assist";
  intensity?: "light" | "classic" | "epic";
  heroes?: HeroSpec[];
  /** Carry on a campaign started earlier instead of a new one. */
  resume?: string;
  /** Play this many rounds without asking: the first choice (or an attack), and every draft approved. */
  auto?: number;
  /** The story writer: in the background, run between turns (steady output, for tests), or not at all. */
  writer?: "background" | "between-turns" | "off";
  log?: Logger;
}

const HELP = [
  "Type a choice's number, your own words, or `pass`. In a fight, a number picks a battle action.",
  "/sheet  your heroes    /journal  the journal    /jobs  what the story writer is doing",
  "/rewind N  go back N turns    /help    /quit",
].join("\n");

const DEFAULT_HEROES: HeroSpec[] = [{ name: "Wren", classId: "lanternkeeper" }];

async function makeHero(engine: Engine, campaignId: string, userId: string, hero: HeroSpec) {
  await engine.characters.startDraft(campaignId, userId);
  for (const op of [
    { op: "class", classId: hero.classId },
    { op: "path", pathId: hero.pathId ?? "long-road" },
    { op: "background", backgroundId: "farmhand" },
    { op: "species", speciesId: "pipkin" },
    { op: "recommended" },
    { op: "keepsake", keepsakeId: "carved-wooden-bird" },
    { op: "name", name: hero.name, look: "Bright-eyed, with a patched travelling cloak." },
  ])
    await engine.characters.updateDraft(campaignId, userId, op as never);
  return engine.characters.finalize(campaignId, userId);
}

/** Plays a campaign through `io` until it ends, input runs out, `/quit`, or `auto` rounds have been played. */
export async function playSession(
  o: PlaySessionOptions,
  io: PlayIO,
): Promise<{ campaignId: string; rounds: number; ended: boolean }> {
  const { engine } = o;
  const db = engine.deps.db;
  const mode = o.mode ?? "ai_dm";
  const guildId = o.guildId ?? "local-play";
  let host: string;
  let campaignId: string;
  let heroes: Array<{ id: string; userId: string; name: string }>;
  let result: ResolveResult | null = null;

  if (o.resume) {
    const c = await engine.campaigns.require(o.resume);
    campaignId = c.id;
    host = c.createdBy;
    heroes = (
      await db
        .select()
        .from(characters)
        .where(and(eq(characters.campaignId, c.id), eq(characters.status, "active")))
    ).map((h) => ({ id: h.id, userId: h.userId, name: h.name }));
    io.say(`Carrying on ${c.name} (${c.id}) at turn ${c.turnSeq}.`);
  } else {
    const specs = o.heroes?.length ? o.heroes : DEFAULT_HEROES;
    host = "player-1";
    const c = await engine.campaigns.create({
      guildId,
      guildName: "Local play",
      channelId: `local-${randomUUID().slice(0, 8)}`,
      name: "Local Play",
      mode,
      createdBy: host,
      ...(mode === "assist" ? { dmUserId: "play-dm" } : {}),
      // Epic takes a guardian on a family campaign; a local session is the grown-ups' own table.
      ...(o.intensity === "epic" ? { settings: { audience: "teen" as const } } : {}),
    });
    campaignId = c.id;
    if (o.intensity) await engine.campaigns.setStory(c.id, host, { intensity: o.intensity });
    heroes = [];
    for (const [i, spec] of specs.entries()) {
      const userId = `player-${i + 1}`;
      if (i > 0) await engine.campaigns.join(c.id, userId);
      const sheet = await makeHero(engine, c.id, userId, spec);
      heroes.push({ id: sheet.id, userId, name: sheet.name });
    }
    io.say(`A new campaign (${c.id}) with ${heroes.map((h) => h.name).join(", ")}. ${HELP}`);
    result = await engine.turns.startCampaign(c.id, host);
  }
  const dm = mode === "assist" ? "play-dm" : host;

  const writer =
    o.writer === "off"
      ? null
      : new StoryWriter({
          db,
          llm: engine.deps.llm,
          worlds: engine.deps.worlds,
          jobs: engine.storyJobs,
          campaignId,
          log: o.log ?? silentLogger,
          pollMs: 500,
        });
  if (writer && o.writer !== "between-turns") writer.start();
  const notices = async () => {
    for (const job of await engine.storyJobs.pendingNotices(20, campaignId)) {
      if (job.notice) io.say(`[DM room] ${job.notice.text}`);
      await engine.storyJobs.markNoticed(job);
    }
  };

  const command = async (line: string): Promise<"quit" | ResolveResult | null> => {
    const [cmd, arg] = line.slice(1).trim().split(/\s+/);
    switch (cmd) {
      case "quit":
        return "quit";
      case "sheet":
        for (const h of heroes) io.say(formatSheet(await engine.characters.sheet(h.id)));
        return null;
      case "journal":
        io.say(formatJournal(await engine.campaigns.journal(campaignId)));
        return null;
      case "jobs": {
        const jobs = await engine.storyJobs.recent(campaignId);
        io.say(
          jobs.length === 0
            ? "The story writer hasn't been asked for anything yet."
            : jobs
                .map(
                  (j) =>
                    `  ${j.kind === "chapter_recap" ? "recap of chapter" : "chapter"} ${j.key}: ${j.status}` +
                    `${j.steps.length ? ` (done: ${j.steps.map((s) => s.name).join(", ")})` : ""}` +
                    `${j.error && j.status !== "done" ? `: ${j.error}` : ""}`,
                )
                .join("\n"),
        );
        return null;
      }
      case "rewind": {
        const back = Number(arg ?? 1);
        const c = await engine.campaigns.require(campaignId);
        const { view, undone } = await engine.turns.rewind(
          campaignId,
          host,
          c.turnSeq - back,
          "from pnpm play",
        );
        io.say(`⏪ Back ${undone} turn${undone === 1 ? "" : "s"}.`);
        return { kind: "turn", view };
      }
      default:
        io.say(HELP);
        return null;
    }
  };

  /** The DM room: approve, edit or redo a draft, or tell a turn the storyteller couldn't. */
  const dmRoom = async (first: DmDraft): Promise<ResolveResult | "quit"> => {
    let draft = first;
    let show = true;
    for (;;) {
      if (show) io.say(formatDraft(draft));
      show = false;
      if (o.auto !== undefined) {
        const edits = draft.handoff
          ? { narration: "The DM takes up the tale, and the heroes press on." }
          : {};
        return { kind: "turn", view: await engine.turns.approveDraft(draft.approvalId, dm, edits) };
      }
      const answer = await io.ask(
        draft.handoff ? "DM: [w]rite it, ask the storyteller [a]gain> " : "DM: [o]k, [e]dit, [r]edo> ",
      );
      if (answer === null) return "quit";
      const input = answer.trim();
      if (input.startsWith("/")) {
        const r = await command(input);
        if (r === "quit") return "quit";
        if (r) return r;
        continue;
      }
      const pick = {
        o: "ok",
        ok: "ok",
        e: "edit",
        edit: "edit",
        w: "edit",
        write: "edit",
        r: "redo",
        redo: "redo",
        a: "redo",
        again: "redo",
      }[input.toLowerCase()];
      if (pick === "ok" && !draft.handoff)
        return { kind: "turn", view: await engine.turns.approveDraft(draft.approvalId, dm) };
      if (pick === "edit") {
        const narration = await io.ask("What happens (one line)> ");
        if (narration === null) return "quit";
        const choices = await io.ask("Choices for the players, separated by | (empty keeps them)> ");
        const list = (choices ?? "")
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        return {
          kind: "turn",
          view: await engine.turns.approveDraft(draft.approvalId, dm, {
            narration,
            ...(list.length ? { choices: list } : {}),
          }),
        };
      }
      if (pick === "redo") {
        const guidance = draft.handoff ? "" : ((await io.ask("Guidance for the storyteller> ")) ?? "");
        draft = await engine.turns.regenerateDraft(draft.approvalId, dm, guidance);
        show = true;
        continue;
      }
      io.say(draft.handoff ? "Answer w to write it or a to ask the storyteller again." : "Answer o, e or r.");
    }
  };

  /** Each hero's move for the round. Returns what to show next if a command (a rewind) changed the story. */
  const moves = async (view: TurnView): Promise<"quit" | "done" | ResolveResult> => {
    const roundId = view.roundId as string;
    const fighting = view.combat?.phase === "fighting";
    for (const hero of heroes) {
      for (;;) {
        await notices();
        const options = fighting ? await engine.turns.combatOptions(roundId, hero.userId) : null;
        if (options?.down) {
          io.say(`${hero.name} is down and can't act this round.`);
          await engine.turns.submitAction({ roundId, userId: hero.userId, kind: "pass" });
          break;
        }
        const battle = options ? battleChoices(options, hero.name) : [];
        if (battle.length) io.say(battle.map((b, i) => `  ${i + 1}) ${b.label}`).join("\n"));
        const auto = o.auto !== undefined;
        const line = auto
          ? battle.length || view.choices.length
            ? "1"
            : "look around carefully"
          : await io.ask(`${hero.name}> `);
        if (line === null) return "quit";
        const input = line.trim();
        if (!input) continue;
        if (input.startsWith("/")) {
          const r = await command(input);
          if (r === "quit") return "quit";
          if (r) return r;
          continue;
        }
        const n = /^\d+$/.test(input) ? Number(input) : null;
        const pick = n !== null ? (fighting ? battle[n - 1] : view.choices[n - 1]) : undefined;
        if (n !== null && !pick) {
          io.say("There's no choice with that number.");
          continue;
        }
        const base = { roundId, userId: hero.userId, interactionId: randomUUID() };
        const res = await engine.turns.submitAction(
          input.toLowerCase() === "pass"
            ? { ...base, kind: "pass" }
            : fighting && pick && "action" in pick
              ? { ...base, kind: "combat", action: pick.action }
              : pick
                ? { ...base, kind: "choice", choiceIndex: (n as number) - 1 }
                : { ...base, kind: "freeform", text: input },
        );
        if (!res.ok) {
          io.say(res.message);
          if (auto) return "quit";
          continue;
        }
        if ("deflection" in res) {
          io.say(`(${res.deflection})`);
          continue;
        }
        if (auto) io.say(`${hero.name}: ${pick ? ("label" in pick ? pick.label : "") : input}`);
        break;
      }
    }
    return "done";
  };

  /** Resuming: the round that's open, with the choices it offered. */
  const openRound = async (): Promise<TurnView | null> => {
    const round = await engine.turns.currentRound(campaignId);
    if (!round) return null;
    const recent = (await engine.campaigns.journal(campaignId)).recent.at(-1);
    if (recent) io.say(`\n${recent}`);
    const offered = (round.choices as Array<{ label: string }>).map((c, index) => ({
      index,
      label: c.label,
    }));
    if (offered.length)
      io.say(["", "What do you do?", ...offered.map((c) => `  ${c.index + 1}) ${c.label}`)].join("\n"));
    return {
      roundId: round.id,
      choices: offered,
      combat: round.kind === "combat" ? { phase: "fighting" } : null,
    } as unknown as TurnView;
  };

  let rounds = 0;
  try {
    for (;;) {
      if (result?.kind === "draft") {
        const told = await dmRoom(result.draft);
        if (told === "quit") return { campaignId, rounds, ended: false };
        result = told;
        continue;
      }
      if (result) io.say(formatTurn(result.view));
      if (writer && o.writer === "between-turns") await writer.drain();
      await notices();
      const view = result ? result.view : await openRound();
      if (!view) {
        io.say("This campaign has no round open: it has ended, or a turn is waiting in the DM room.");
        return { campaignId, rounds, ended: true };
      }
      if (view.campaignEnded || !view.roundId) return { campaignId, rounds, ended: true };
      if (o.auto !== undefined && rounds >= o.auto) return { campaignId, rounds, ended: false };
      const moved = await moves(view);
      if (moved === "quit") return { campaignId, rounds, ended: false };
      if (moved !== "done") {
        result = moved;
        continue;
      }
      rounds++;
      const next = await engine.turns.resolveRound(view.roundId as string);
      if (!next) {
        io.say("Someone else is already telling this round.");
        return { campaignId, rounds, ended: false };
      }
      result = next;
    }
  } finally {
    await writer?.stop(1_000);
    await notices().catch(() => {});
  }
}

// ---------------------------------------------------------------- the command line

const LLM_JOBS = ["narrator", "director", "writer", "intent", "safety", "judge", "summarizer"] as const;

export interface PlayService {
  /** A service from the presets list (packages/providers/presets/llm), such as "zai" or "custom-openai". */
  presetId: string;
  /** Another address than the preset's own. */
  baseUrl?: string;
  /** Its API key, stored encrypted with `masterKeys` the way the setup page stores keys. */
  apiKey?: string;
  masterKeys?: MasterKey[];
  /** One model for every job; otherwise each job gets the preset's own choice. */
  model?: string;
  selfHosted?: boolean;
  capabilityOverrides?: Record<string, unknown>;
}

/**
 * Points every story job of the local guild at one service, as the setup page would: its provider settings, its
 * key (encrypted), and a route per job with the preset's model and settings for that job. Replaces whatever the
 * local guild used before.
 */
export async function useService(db: Db, guildId: string, service: PlayService): Promise<void> {
  const p = preset(service.presetId);
  if (p?.kind !== "llm") throw new Error(`there's no story service called "${service.presetId}"`);
  const modelFor = (task: (typeof LLM_JOBS)[number]) =>
    service.model ??
    p.defaultModels[task] ??
    (task === "writer" ? p.defaultModels.director : undefined) ??
    p.defaultModels.narrator ??
    p.models[0]?.id;
  if (!modelFor("narrator")) throw new Error(`${p.label} has no default model: name one with --model`);
  await db.insert(guilds).values({ id: guildId, name: "Local play" }).onConflictDoNothing();
  await db.delete(taskRoutes).where(eq(taskRoutes.guildId, guildId));
  await db.delete(providerConfigs).where(eq(providerConfigs.guildId, guildId));
  await db.delete(secrets).where(eq(secrets.guildId, guildId));
  let secretId: string | null = null;
  if (service.apiKey) {
    if (!service.masterKeys?.length) throw new Error("an API key needs MASTER_KEYS to be stored");
    secretId = randomUUID();
    const sealed = encryptSecret(service.apiKey, service.masterKeys, guildId, secretId);
    await db.insert(secrets).values({ id: secretId, guildId, ...sealed, createdBy: "pnpm play" });
  }
  const [cfg] = await db
    .insert(providerConfigs)
    .values({
      guildId,
      kind: "llm",
      name: `Local play: ${p.label}`,
      presetId: p.id,
      adapterId: p.adapter,
      baseUrl: service.baseUrl ?? null,
      secretId,
      selfHosted: service.selfHosted ?? p.selfHosted,
      capabilityOverrides: service.capabilityOverrides ?? {},
    })
    .returning();
  await db.insert(taskRoutes).values(
    LLM_JOBS.map((task) => ({
      guildId,
      task,
      providerConfigId: cfg?.id as string,
      model: modelFor(task) as string,
      params: (p.defaultParams[task] ?? {}) as Record<string, unknown>,
      priority: 0,
    })),
  );
}

/** Points every story job of the local guild at a keyless OpenAI-compatible endpoint (the stand-in, a local model). */
export async function routeEverythingTo(db: Db, guildId: string, baseUrl: string, model: string) {
  await useService(db, guildId, {
    presetId: "custom-openai",
    baseUrl,
    model,
    selfHosted: true,
    capabilityOverrides: { structured: "json_schema" },
  });
}

/** The variable `--ai <service>` reads its key from unless --key-env names another: ZAI_API_KEY for zai. */
export function keyVariable(presetId: string): string {
  return serviceVariable(presetId, "API_KEY");
}

/** The variable that gives `--ai <service>` another address than its preset's, unless --base-url does: ZAI_BASE_URL. */
export function addressVariable(presetId: string): string {
  return serviceVariable(presetId, "BASE_URL");
}

function serviceVariable(presetId: string, setting: string): string {
  return `${presetId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${setting}`;
}

function keyFrom(name: string, env: NodeJS.ProcessEnv): string {
  const key = env[name]?.trim();
  if (!key)
    throw new Error(
      `${name} isn't set: put the service's API key in it (or name another variable with --key-env)`,
    );
  return key;
}

function masterKeysFrom(env: NodeJS.ProcessEnv): MasterKey[] {
  const raw = env.MASTER_KEYS;
  if (!raw || raw.includes("REPLACE_ME"))
    throw new Error(
      "MASTER_KEYS isn't set: keys are stored encrypted, as the setup page stores them. Make one with\n" +
        "  node -e \"console.log('v1:'+require('crypto').randomBytes(32).toString('base64'))\"\n" +
        "and set MASTER_KEYS to it (in .env with Docker, so the writer can read the key too).",
    );
  return parseMasterKeys(raw);
}

/** Whether an address is on a hosted service's host from the presets list (any path, such as Z.ai's Coding Plan). */
function hostedAddress(url: string): boolean {
  const host = new URL(url).host;
  return presets("llm").some((p) => !p.selfHosted && p.baseUrl !== null && new URL(p.baseUrl).host === host);
}

/**
 * What `--ai <service>` sets up, from the command line and the environment (.env with Docker): the key from its
 * variable, another address from --base-url or its variable, and MASTER_KEYS to store the key encrypted.
 */
export function serviceFromEnv(
  p: Preset,
  opts: { model?: string; baseUrl?: string; keyEnv?: string },
  env: NodeJS.ProcessEnv = process.env,
): PlayService {
  const keyName = opts.keyEnv ?? keyVariable(p.id);
  const apiKey = p.needsKey || opts.keyEnv ? keyFrom(keyName, env) : undefined;
  const addressName = opts.baseUrl ? "--base-url" : addressVariable(p.id);
  const baseUrl = opts.baseUrl ?? (env[addressVariable(p.id)]?.trim() || undefined);
  if (baseUrl) {
    let u: URL;
    try {
      u = new URL(baseUrl);
    } catch {
      throw new Error(`${addressName} isn't a web address`);
    }
    if (u.protocol !== "https:" && u.protocol !== "http:")
      throw new Error(
        `${addressName} should start with https:// (or http:// on your own machine or network)`,
      );
    if (u.username || u.password)
      throw new Error(`${addressName} has credentials in it: put the key in ${keyName}`);
  }
  return {
    presetId: p.id,
    // A hosted service's address is reached like any hosted service; another (this machine, a proxy, a test
    // server) may be on a private network, so it's let through.
    ...(baseUrl ? { baseUrl, selfHosted: !hostedAddress(baseUrl) } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(apiKey ? { apiKey, masterKeys: masterKeysFrom(env) } : {}),
  };
}

const USAGE = `pnpm play [options]: the game in a terminal, no Discord.

  --ai fake               the scripted storyteller, no AI service (the default)
  --ai mock               a local stand-in that goes through the real provider code (--slow 1-3 to slow it)
  --ai env                the server defaults from OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
  --ai <service>          one of: ${presets("llm")
    .map((p) => p.id)
    .join(", ")}
                          its key comes from <SERVICE>_API_KEY (ZAI_API_KEY for zai), or --key-env NAME;
                          keys are stored encrypted, so MASTER_KEYS must be set
  --ai <url> --model <m>  any OpenAI-compatible endpoint (keyless unless --key-env)
  --model <id>            one model for every job (default: the service's choice per job)
  --base-url <url>        another address for the service, or <SERVICE>_BASE_URL (ZAI_BASE_URL for zai)
  --key-env <NAME>        the environment variable that holds the key

  --heroes "Wren:lanternkeeper,Bram:shieldheart"   --mode assist   --intensity light|classic|epic
  --resume <campaign id>  --auto <rounds>  --transcript <file>  --log <file>  --no-writer  --seed <x>  --db <url>`;

function heroesFrom(arg: string | undefined): HeroSpec[] | undefined {
  if (!arg) return undefined;
  return arg.split(",").map((part) => {
    const [name, classId, pathId] = part.split(":").map((s) => s.trim());
    if (!name || !classId) throw new Error(`--heroes wants Name:class[:path], got "${part}"`);
    return { name, classId, ...(pathId ? { pathId } : {}) };
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      db: { type: "string" },
      ai: { type: "string", default: "fake" },
      model: { type: "string" },
      "base-url": { type: "string" },
      "key-env": { type: "string" },
      slow: { type: "string" },
      mode: { type: "string", default: "ai_dm" },
      intensity: { type: "string" },
      heroes: { type: "string" },
      seed: { type: "string" },
      resume: { type: "string" },
      auto: { type: "string" },
      transcript: { type: "string" },
      log: { type: "string" },
      "no-writer": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const ai = values.ai as string;
  const keyEnv = values["key-env"];
  const isUrl = /^https?:\/\//.test(ai);
  const service = isUrl || ["fake", "mock", "env"].includes(ai) ? undefined : preset(ai);
  if (!isUrl && !["fake", "mock", "env"].includes(ai) && service?.kind !== "llm") {
    process.stderr.write(`--ai "${ai}" isn't a story service.\n\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  if (isUrl && !values.model) throw new Error("--ai <url> needs --model");

  const url = values.db ?? process.env.DATABASE_URL ?? "postgres://dq:dq@localhost:5432/dq";
  const handle = connect(url, { max: 5 });
  await runMigrations(handle.db);

  const logLines: string[] = [];
  const log = values.log
    ? createLogger({ service: "play", format: "json", write: (line) => logLines.push(line) })
    : silentLogger;
  const guildId = "local-play";
  let llm: LlmGateway;
  let mock: Awaited<ReturnType<typeof startMockProvider>> | null = null;
  if (ai === "fake") llm = new FakeLlm();
  else {
    const env = { ...process.env, ALLOW_PRIVATE_ENDPOINTS: "true" };
    if (ai === "mock") {
      const [min = 0, max = min] = (values.slow ?? "0").split("-").map((s) => Number(s) * 1000);
      mock = await startMockProvider({ delayMs: [min, max] });
      await routeEverythingTo(handle.db, guildId, mock.url, "mock");
    } else if (ai === "env") {
      // The server-default routes from the environment's keys; nothing of the local guild's own.
      await handle.db.delete(taskRoutes).where(eq(taskRoutes.guildId, guildId));
    } else if (isUrl) {
      const apiKey = keyEnv ? keyFrom(keyEnv, process.env) : undefined;
      await useService(handle.db, guildId, {
        presetId: "custom-openai",
        baseUrl: ai,
        model: values.model as string,
        selfHosted: true,
        capabilityOverrides: { structured: "json_schema" },
        ...(apiKey ? { apiKey, masterKeys: masterKeysFrom(process.env) } : {}),
      });
    } else if (service) {
      await useService(
        handle.db,
        guildId,
        serviceFromEnv(service, { model: values.model, baseUrl: values["base-url"], keyEnv }),
      );
    }
    const store = new ProviderStore(handle.db, env);
    llm = new ProviderGateway(store, new BudgetGuard(handle.db, env), { log });
  }
  const engine = createEngine({
    db: handle.db,
    worlds: new WorldCache(),
    llm,
    log,
    ...(values.seed ? { dice: seededDice } : {}),
  });

  const transcript: string[] = [];
  const rl = createInterface({ input: process.stdin, terminal: Boolean(process.stdin.isTTY) });
  // Lines are read through the iterator, which keeps lines piped in ahead of their prompts.
  const lines = rl[Symbol.asyncIterator]();
  const io: PlayIO = {
    say: (text) => {
      transcript.push(text);
      process.stdout.write(`${text}\n`);
    },
    ask: async (prompt) => {
      process.stdout.write(prompt);
      const next = await lines.next();
      if (next.done) return null;
      if (!process.stdin.isTTY) process.stdout.write(`${next.value}\n`);
      transcript.push(`${prompt}${next.value}`);
      return next.value;
    },
  };

  try {
    const done = await playSession(
      {
        engine,
        guildId,
        mode: values.mode === "assist" ? "assist" : "ai_dm",
        ...(values.intensity ? { intensity: values.intensity as "light" | "classic" | "epic" } : {}),
        ...(values.heroes ? { heroes: heroesFrom(values.heroes) as HeroSpec[] } : {}),
        ...(values.resume ? { resume: values.resume } : {}),
        ...(values.auto ? { auto: Number(values.auto) } : {}),
        writer: values["no-writer"] ? "off" : values.auto ? "between-turns" : "background",
        log,
      },
      io,
    );
    // The same service on the way back in: the options that chose it, never the key itself.
    const service = [
      ...(values.ai === "fake" ? [] : [`--ai ${values.ai}`]),
      ...(values.model ? [`--model ${values.model}`] : []),
      ...(values["base-url"] ? [`--base-url ${values["base-url"]}`] : []),
      ...(keyEnv ? [`--key-env ${keyEnv}`] : []),
    ];
    io.say(
      `\n${done.ended ? "The adventure is over." : "Stopped."} ${done.rounds} round${done.rounds === 1 ? "" : "s"} played. Carry on with: ${["pnpm play", `--resume ${done.campaignId}`, ...service].join(" ")}`,
    );
    if (mock) io.say(`The stand-in AI answered ${mock.stats.answered} requests.`);
  } catch (e) {
    process.stderr.write(`${e instanceof GameError ? e.userMessage : (e as Error).stack}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    if (values.transcript) writeFileSync(values.transcript, `${transcript.join("\n")}\n`);
    if (values.log) writeFileSync(values.log, `${logLines.join("\n")}\n`);
    await mock?.close();
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main().catch((e: Error) => {
    // Setup problems (a missing key, an unknown option) read as one plain message.
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  });
