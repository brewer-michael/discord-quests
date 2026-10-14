import { randomUUID } from "node:crypto";
import { type DbOrTx, guilds, providerConfigs, secrets, taskRoutes } from "@dq/db";
import { encryptSecret, type MasterKey, maskSecret } from "@dq/db/crypto";
import {
  type BudgetGuard,
  costMicros,
  createSafeFetch,
  GenericHttpSpecSchema,
  imageAdapter,
  llmAdapter,
  type Preset,
  type ProviderStore,
  preset,
  presets,
  type ResolvedProviderConfig,
} from "@dq/providers";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "./audit";
import { STORY_TASKS } from "./tasks";

// ------------------------------------------------------------------ presets for the form

/** What the browser needs to draw the form. Nothing secret lives in a preset. */
export interface PresetOption {
  id: string;
  kind: "llm" | "image";
  label: string;
  description: string;
  baseUrl: string | null;
  baseUrlEditable: boolean;
  custom: boolean;
  selfHosted: boolean;
  needsKey: boolean;
  keyUrl: string | null;
  generic: boolean;
  models: Array<{ id: string; label: string }>;
  defaultModel: string | null;
  genericSpecExample: string | null;
}

const isCustom = (p: Preset) => p.id.startsWith("custom-");

export function presetOptions(): PresetOption[] {
  return presets().map((p) => ({
    id: p.id,
    kind: p.kind,
    label: p.label,
    description: p.description,
    baseUrl: p.baseUrl,
    baseUrlEditable: p.baseUrlEditable,
    custom: isCustom(p),
    selfHosted: p.selfHosted,
    needsKey: p.needsKey,
    keyUrl: p.keyUrl ?? null,
    generic: p.adapter === "generic_http",
    models: p.models.map((m) => ({ id: m.id, label: m.label })),
    defaultModel: (p.kind === "image" ? p.defaultModels.image : p.defaultModels.narrator) ?? null,
    genericSpecExample:
      p.adapter === "generic_http"
        ? JSON.stringify(p.genericSpec ?? preset("automatic1111")?.genericSpec ?? null, null, 2)
        : null,
  }));
}

// ------------------------------------------------------------------ form input

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
    z.string().max(max).optional(),
  );
const optionalPrice = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined),
  z.number({ error: "Enter a number" }).min(0).max(1000).optional(),
);

export const ProviderForm = z.object({
  kind: z.enum(["llm", "image"]),
  presetId: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Give it a name").max(60),
  baseUrl: optionalText(300),
  apiKey: optionalText(1000),
  removeKey: checkbox,
  authType: z.enum(["preset", "bearer", "header", "query", "none"]).default("preset"),
  authName: optionalText(60),
  authPrefix: z.preprocess(
    (v) => (typeof v === "string" && v !== "" ? v : undefined),
    z.string().max(30).optional(),
  ),
  extraHeaders: optionalText(2000),
  structured: z.enum(["preset", "json_schema", "json_object", "prompt_only"]).default("preset"),
  genericSpec: optionalText(10_000),
  model: optionalText(150),
  priceInput: optionalPrice,
  priceOutput: optionalPrice,
  priceImage: optionalPrice,
  selfHosted: checkbox,
  enabled: checkbox,
  useFor: z.enum(["none", "story", "images"]).default("none"),
});
export type ProviderFormInput = z.infer<typeof ProviderForm>;

export type FieldErrors = Partial<Record<keyof ProviderFormInput | "form", string>>;

export function parseProviderForm(
  fd: FormData,
): { ok: true; value: ProviderFormInput } | { ok: false; errors: FieldErrors } {
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
  const parsed = ProviderForm.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = (issue.path[0] as keyof ProviderFormInput | undefined) ?? "form";
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

const HEADER_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,59}$/;
const RESERVED_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "cookie"]);

function parseHeaders(
  text: string | undefined,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const out: Record<string, string> = {};
  for (const line of (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const i = line.indexOf(":");
    const name = i > 0 ? line.slice(0, i).trim() : "";
    const value = i > 0 ? line.slice(i + 1).trim() : "";
    if (!HEADER_NAME.test(name) || !value)
      return { ok: false, error: `Write each header as "Name: value" (problem: "${line.slice(0, 40)}")` };
    if (RESERVED_HEADERS.has(name.toLowerCase()))
      return { ok: false, error: `The ${name} header can't be set here` };
    out[name] = value.slice(0, 500);
  }
  if (Object.keys(out).length > 10) return { ok: false, error: "Ten extra headers at most" };
  return { ok: true, value: out };
}

/** Endpoints must be HTTPS, unless the operator allows private (self-hosted) endpoints. */
export function checkBaseUrl(url: string, allowPrivate: boolean): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "That isn't a web address";
  }
  if (u.username || u.password) return "Put credentials in the API key field, not the address";
  if (u.protocol === "https:") return null;
  if (u.protocol === "http:" && allowPrivate) return null;
  return allowPrivate ? "Use an http:// or https:// address" : "Use an https:// address";
}

interface BuiltRow {
  values: Omit<typeof providerConfigs.$inferInsert, "id" | "guildId" | "secretId">;
}

/** Turns a validated form into a database row, or explains what to fix. */
export function buildRow(
  input: ProviderFormInput,
  opts: { allowPrivate: boolean },
): { ok: true; row: BuiltRow; preset: Preset } | { ok: false; errors: FieldErrors } {
  const p = preset(input.presetId);
  if (!p || p.kind !== input.kind)
    return { ok: false, errors: { presetId: "Choose a service from the list" } };
  const errors: FieldErrors = {};
  const custom = isCustom(p);

  const baseUrl = p.baseUrlEditable ? (input.baseUrl ?? p.baseUrl) : p.baseUrl;
  if (p.baseUrlEditable && !baseUrl) errors.baseUrl = "Enter the address of the service";
  if (baseUrl && p.baseUrlEditable) {
    const problem = checkBaseUrl(baseUrl, opts.allowPrivate);
    if (problem) errors.baseUrl = problem;
  }

  let auth: Record<string, unknown> = {};
  if (custom && input.authType !== "preset") {
    if (input.authType === "header") {
      if (!input.authName || !HEADER_NAME.test(input.authName))
        errors.authName = "Enter the header name, like X-Api-Key";
      auth = {
        type: "header",
        headerName: input.authName,
        ...(input.authPrefix ? { prefix: input.authPrefix } : {}),
      };
    } else if (input.authType === "query") {
      if (!input.authName || !/^[A-Za-z0-9_-]{1,40}$/.test(input.authName))
        errors.authName = "Enter the query parameter name, like key";
      auth = { type: "query", paramName: input.authName };
    } else {
      auth = { type: input.authType };
    }
  }

  const headers = parseHeaders(input.extraHeaders);
  if (!headers.ok) errors.extraHeaders = headers.error;

  let genericSpec: Record<string, unknown> | null = null;
  if (p.adapter === "generic_http" && custom) {
    if (!input.genericSpec)
      errors.genericSpec = "Describe the request and where the image is in the response";
    else {
      try {
        const spec = GenericHttpSpecSchema.safeParse(JSON.parse(input.genericSpec));
        if (spec.success) genericSpec = spec.data as unknown as Record<string, unknown>;
        else
          errors.genericSpec = spec.error.issues
            .map((i) => `${i.path.join(".") || "spec"}: ${i.message}`)
            .slice(0, 3)
            .join("; ");
      } catch {
        errors.genericSpec = "That isn't valid JSON";
      }
    }
  }

  const capabilityOverrides: Record<string, unknown> =
    custom && input.kind === "llm" && input.structured !== "preset" ? { structured: input.structured } : {};

  const pricing: Record<string, unknown> = {};
  if (
    input.model &&
    (input.priceInput !== undefined || input.priceOutput !== undefined || input.priceImage !== undefined)
  ) {
    pricing[input.model] = {
      ...(input.priceInput !== undefined ? { input: input.priceInput } : {}),
      ...(input.priceOutput !== undefined ? { output: input.priceOutput } : {}),
      ...(input.priceImage !== undefined ? { image: input.priceImage } : {}),
    };
  }

  if (input.useFor === "story" && input.kind !== "llm")
    errors.useFor = "Picture services can't tell the story";
  if (input.useFor === "images" && input.kind !== "image")
    errors.useFor = "Story services can't paint scenes";
  const model = input.model ?? (input.kind === "image" ? p.defaultModels.image : p.defaultModels.narrator);
  if (input.useFor !== "none" && !model) errors.model = "Choose which model to use";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    preset: p,
    row: {
      values: {
        kind: input.kind,
        name: input.name,
        presetId: p.id,
        adapterId: p.adapter,
        baseUrl: p.baseUrlEditable ? (baseUrl ?? null) : null,
        auth,
        extraHeaders: headers.ok ? headers.value : {},
        modelDefaults: input.model ? { model: input.model } : {},
        capabilityOverrides,
        pricing,
        genericSpec,
        selfHosted: custom ? input.selfHosted : false,
        enabled: input.enabled,
      },
    },
  };
}

// ------------------------------------------------------------------ reads

export interface ProviderSummary {
  id: string;
  kind: "llm" | "image";
  name: string;
  presetId: string;
  presetLabel: string;
  baseUrl: string | null;
  keyMask: string | null;
  enabled: boolean;
  selfHosted: boolean;
  model: string | null;
  tasks: string[];
}

export async function listProviders(db: DbOrTx, guildId: string): Promise<ProviderSummary[]> {
  const rows = await db
    .select({ cfg: providerConfigs, last4: secrets.last4 })
    .from(providerConfigs)
    .leftJoin(secrets, eq(secrets.id, providerConfigs.secretId))
    .where(eq(providerConfigs.guildId, guildId))
    .orderBy(providerConfigs.kind, providerConfigs.createdAt);
  const ids = rows.map((r) => r.cfg.id);
  const routes =
    ids.length > 0
      ? await db
          .select({ providerConfigId: taskRoutes.providerConfigId, task: taskRoutes.task })
          .from(taskRoutes)
          .where(and(inArray(taskRoutes.providerConfigId, ids), isNull(taskRoutes.campaignId)))
      : [];
  return rows.map(({ cfg, last4 }) => ({
    id: cfg.id,
    kind: cfg.kind,
    name: cfg.name,
    presetId: cfg.presetId,
    presetLabel: preset(cfg.presetId)?.label ?? cfg.presetId,
    baseUrl: cfg.baseUrl ?? preset(cfg.presetId)?.baseUrl ?? null,
    keyMask: last4 ? maskSecret(last4) : null,
    enabled: cfg.enabled,
    selfHosted: cfg.selfHosted,
    model: typeof cfg.modelDefaults.model === "string" ? cfg.modelDefaults.model : null,
    tasks: [...new Set(routes.filter((r) => r.providerConfigId === cfg.id).map((r) => r.task))],
  }));
}

/** Form values for editing. The API key itself is never sent back, only its last four characters. */
export async function providerFormValues(db: DbOrTx, guildId: string, id: string) {
  const [row] = await db
    .select({ cfg: providerConfigs, last4: secrets.last4 })
    .from(providerConfigs)
    .leftJoin(secrets, eq(secrets.id, providerConfigs.secretId))
    .where(and(eq(providerConfigs.id, id), eq(providerConfigs.guildId, guildId)));
  if (!row) return null;
  const { cfg } = row;
  const auth = cfg.auth as { type?: string; headerName?: string; paramName?: string; prefix?: string };
  const model = typeof cfg.modelDefaults.model === "string" ? cfg.modelDefaults.model : "";
  const price = (cfg.pricing[model] ?? {}) as { input?: number; output?: number; image?: number };
  return {
    id: cfg.id,
    kind: cfg.kind,
    presetId: cfg.presetId,
    name: cfg.name,
    baseUrl: cfg.baseUrl ?? "",
    keyMask: row.last4 ? maskSecret(row.last4) : null,
    authType: !auth.type || auth.type === "bearer" ? "preset" : auth.type,
    authName: auth.headerName ?? auth.paramName ?? "",
    authPrefix: auth.prefix ?? "",
    extraHeaders: Object.entries(cfg.extraHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    structured:
      typeof cfg.capabilityOverrides.structured === "string" ? cfg.capabilityOverrides.structured : "preset",
    genericSpec: cfg.genericSpec ? JSON.stringify(cfg.genericSpec, null, 2) : "",
    model,
    priceInput: price.input?.toString() ?? "",
    priceOutput: price.output?.toString() ?? "",
    priceImage: price.image?.toString() ?? "",
    selfHosted: cfg.selfHosted,
    enabled: cfg.enabled,
  };
}
export type ProviderFormValues = NonNullable<Awaited<ReturnType<typeof providerFormValues>>>;

// ------------------------------------------------------------------ writes

export async function ensureGuild(db: DbOrTx, guild: { id: string; name: string }) {
  await db
    .insert(guilds)
    .values({ id: guild.id, name: guild.name })
    .onConflictDoUpdate({ target: guilds.id, set: { name: guild.name, updatedAt: new Date() } });
}

/** Points every story task (or scene art) at one provider, replacing the server's current routes. */
export async function routeAllTo(
  db: DbOrTx,
  guildId: string,
  providerId: string,
  p: Preset,
  what: "story" | "images",
  model: string | undefined,
) {
  const tasks = what === "story" ? [...STORY_TASKS] : (["image"] as const);
  await db
    .delete(taskRoutes)
    .where(
      and(eq(taskRoutes.guildId, guildId), isNull(taskRoutes.campaignId), inArray(taskRoutes.task, tasks)),
    );
  await db.insert(taskRoutes).values(
    tasks.map((task) => ({
      guildId,
      campaignId: null,
      task,
      providerConfigId: providerId,
      model: model ?? p.defaultModels[task] ?? p.defaultModels.narrator ?? "",
      params: (p.defaultParams[task] ?? {}) as Record<string, unknown>,
      priority: 0,
    })),
  );
}

export async function saveProvider(
  db: DbOrTx,
  keys: MasterKey[],
  args: {
    guild: { id: string; name: string };
    userId: string;
    input: ProviderFormInput;
    existingId?: string;
    allowPrivate: boolean;
  },
): Promise<{ ok: true; id: string } | { ok: false; errors: FieldErrors }> {
  const built = buildRow(args.input, { allowPrivate: args.allowPrivate });
  if (!built.ok) return built;
  const { guild, input } = args;

  return db.transaction(async (tx) => {
    let existing: typeof providerConfigs.$inferSelect | undefined;
    if (args.existingId) {
      [existing] = await tx
        .select()
        .from(providerConfigs)
        .where(and(eq(providerConfigs.id, args.existingId), eq(providerConfigs.guildId, guild.id)));
      if (!existing) return { ok: false as const, errors: { form: "That provider no longer exists" } };
      if (existing.kind !== input.kind)
        return { ok: false as const, errors: { form: "A provider can't change kind" } };
    }
    const keepsKey = Boolean(existing?.secretId) && !input.removeKey;
    if (built.preset.needsKey && !input.apiKey && !keepsKey)
      return { ok: false as const, errors: { apiKey: "This service needs an API key" } };

    await ensureGuild(tx, guild);
    let secretId = input.removeKey ? null : (existing?.secretId ?? null);
    if (input.apiKey) {
      secretId = randomUUID();
      const enc = encryptSecret(input.apiKey, keys, guild.id, secretId);
      await tx.insert(secrets).values({ id: secretId, guildId: guild.id, createdBy: args.userId, ...enc });
    }

    let id: string;
    if (existing) {
      id = existing.id;
      await tx
        .update(providerConfigs)
        .set({ ...built.row.values, secretId, updatedAt: new Date() })
        .where(eq(providerConfigs.id, id));
      if (existing.secretId && existing.secretId !== secretId)
        await tx.delete(secrets).where(eq(secrets.id, existing.secretId));
    } else {
      const [row] = await tx
        .insert(providerConfigs)
        .values({ ...built.row.values, guildId: guild.id, secretId })
        .returning({ id: providerConfigs.id });
      id = row!.id;
    }

    if (input.useFor !== "none") await routeAllTo(tx, guild.id, id, built.preset, input.useFor, input.model);

    await audit(tx, {
      guildId: guild.id,
      userId: args.userId,
      action: existing ? "provider.update" : "provider.create",
      target: id,
      detail: {
        name: input.name,
        presetId: input.presetId,
        keyChanged: Boolean(input.apiKey) || (input.removeKey && Boolean(existing?.secretId)),
        useFor: input.useFor,
      },
    });
    return { ok: true as const, id };
  });
}

export async function deleteProvider(
  db: DbOrTx,
  guildId: string,
  userId: string,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(providerConfigs)
      .where(and(eq(providerConfigs.id, id), eq(providerConfigs.guildId, guildId)))
      .returning();
    if (!row) return false;
    if (row.secretId) await tx.delete(secrets).where(eq(secrets.id, row.secretId));
    await audit(tx, { guildId, userId, action: "provider.delete", target: id, detail: { name: row.name } });
    return true;
  });
}

// ------------------------------------------------------------------ testing a connection

export interface TestResult {
  ok: boolean;
  message: string;
  model: string | null;
  ms: number;
  /** A small preview for image providers, as a data URL. */
  image?: string;
}

const TestReply = z.object({ word: z.string() });

interface NetDeps {
  allowPrivate: boolean;
  /** For tests: replaces network access. */
  fetch?: typeof fetch;
}

function fetchFor(cfg: ResolvedProviderConfig, deps: NetDeps): typeof fetch {
  return deps.fetch ?? createSafeFetch({ allowPrivate: deps.allowPrivate && cfg.selfHosted });
}

async function testModel(
  db: DbOrTx,
  guildId: string,
  cfg: ResolvedProviderConfig,
  row: { modelDefaults: Record<string, unknown> },
) {
  if (typeof row.modelDefaults.model === "string" && row.modelDefaults.model) return row.modelDefaults.model;
  const [route] = await db
    .select({ model: taskRoutes.model })
    .from(taskRoutes)
    .where(and(eq(taskRoutes.providerConfigId, cfg.id), eq(taskRoutes.guildId, guildId)))
    .orderBy(taskRoutes.priority)
    .limit(1);
  if (route?.model) return route.model;
  const p = preset(cfg.presetId);
  return (
    (p?.kind === "image" ? p.defaultModels.image : p?.defaultModels.narrator) ?? p?.models[0]?.id ?? null
  );
}

const lastTest = new Map<string, number>();

/**
 * Makes one tiny real call with the saved settings: a short structured reply
 * for story services, or a small picture for image services. The cost is
 * recorded against the server's usage like any other call.
 */
export async function testProvider(
  deps: NetDeps & { db: DbOrTx; store: ProviderStore; budget: BudgetGuard },
  args: { guildId: string; userId: string; id: string },
): Promise<TestResult> {
  const now = Date.now();
  if (now - (lastTest.get(args.userId) ?? 0) < 4000)
    return {
      ok: false,
      message: "One test at a time, please. Try again in a few seconds.",
      model: null,
      ms: 0,
    };
  lastTest.set(args.userId, now);

  const [row] = await deps.db
    .select()
    .from(providerConfigs)
    .where(and(eq(providerConfigs.id, args.id), eq(providerConfigs.guildId, args.guildId)));
  if (!row) return { ok: false, message: "That provider no longer exists.", model: null, ms: 0 };
  deps.store.invalidate(row.id);
  const cfg = row.enabled ? await deps.store.resolve(row.id) : null;
  if (!cfg) return { ok: false, message: "This provider is switched off.", model: null, ms: 0 };
  const model = await testModel(deps.db, args.guildId, cfg, row);
  if (!model) return { ok: false, message: "Choose a model for this provider first.", model: null, ms: 0 };

  const started = Date.now();
  const ctx = { fetch: fetchFor(cfg, deps) };
  let result: TestResult;
  try {
    if (row.kind === "llm") {
      const adapter = llmAdapter(cfg.adapterId);
      if (!adapter) throw new Error(`no adapter for ${cfg.adapterId}`);
      const res = await adapter.generateStructured(
        {
          task: "judge",
          model,
          system: [
            { text: "You are checking that a connection works. Answer in the requested JSON format." },
          ],
          user: [{ text: 'Reply with the word "lantern".' }],
          schema: TestReply,
          schemaName: "connection_test",
          maxOutputTokens: 1024,
          effort: "low",
        },
        cfg,
        ctx,
      );
      if (res.ok) {
        await deps.budget.record({
          guildId: args.guildId,
          task: "connection_test",
          providerConfigId: cfg.id,
          model: res.model,
          usage: res.usage,
          costMicros: costMicros(cfg.pricing[model], res.usage),
          fellBack: res.fellBack,
        });
        result = {
          ok: true,
          message: `Connected. The model answered "${res.value.word.slice(0, 40)}".`,
          model: res.model,
          ms: Date.now() - started,
        };
      } else {
        result = {
          ok: false,
          message: describeStop(res.stop, res.error),
          model,
          ms: Date.now() - started,
        };
      }
    } else {
      const adapter = imageAdapter(cfg.adapterId);
      if (!adapter) throw new Error(`no adapter for ${cfg.adapterId}`);
      const img = await adapter.generate(
        {
          prompt: "A small glowing lantern on a wooden table, gentle storybook watercolor, no text",
          negativePrompt: "text, letters, watermark",
          width: 512,
          height: 512,
          model,
        },
        cfg,
        ctx,
      );
      await deps.budget.record({
        guildId: args.guildId,
        task: "connection_test",
        providerConfigId: cfg.id,
        model,
        usage: {},
        images: 1,
        costMicros: costMicros(cfg.pricing[model], { images: 1 }),
      });
      result = {
        ok: true,
        message: "Connected. Here's the test picture.",
        model,
        ms: Date.now() - started,
        image:
          img.bytes.length < 6_000_000
            ? `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}`
            : undefined,
      };
    }
  } catch (e) {
    result = { ok: false, message: clean((e as Error).message), model, ms: Date.now() - started };
  }
  await audit(deps.db, {
    guildId: args.guildId,
    userId: args.userId,
    action: "provider.test",
    target: row.id,
    detail: { ok: result.ok, model },
  });
  return result;
}

function describeStop(stop: string, error?: string): string {
  switch (stop) {
    case "refusal":
      return "The model declined the test request.";
    case "max_tokens":
      return "The model ran out of room before finishing. Try another model.";
    case "invalid":
      return `The model answered, but not in the format the bot needs. ${error ? clean(error) : ""} For custom endpoints, try a different structured output setting.`;
    default:
      return error ? clean(error) : "The service didn't answer.";
  }
}

/** Error text from a provider, trimmed and with anything key-shaped hidden. */
export function clean(message: string): string {
  return message
    .replace(/(sk|key|tok|pk|r8|fal)[-_][A-Za-z0-9_-]{8,}/gi, "[hidden]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[hidden]")
    .slice(0, 300);
}

export async function listModels(
  deps: NetDeps & { db: DbOrTx; store: ProviderStore },
  args: { guildId: string; id: string },
): Promise<string[]> {
  const [row] = await deps.db
    .select({ id: providerConfigs.id, kind: providerConfigs.kind })
    .from(providerConfigs)
    .where(and(eq(providerConfigs.id, args.id), eq(providerConfigs.guildId, args.guildId)));
  if (row?.kind !== "llm") return [];
  deps.store.invalidate(row.id);
  const cfg = await deps.store.resolve(row.id);
  const adapter = cfg ? llmAdapter(cfg.adapterId) : undefined;
  if (!cfg || !adapter?.listModels) return [];
  const models = await adapter.listModels(cfg, { fetch: fetchFor(cfg, deps) });
  return models.slice(0, 300);
}

export async function providerCount(db: DbOrTx, guildId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(providerConfigs)
    .where(eq(providerConfigs.guildId, guildId));
  return r?.n ?? 0;
}
