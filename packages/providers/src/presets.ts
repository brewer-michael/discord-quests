import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { GenericHttpSpecSchema } from "./generic-spec";

const Pricing = z.strictObject({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  image: z.number().optional(),
});

const EffortLevel = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** A model as its provider documents it. Requests use these values; the setup page shows them. */
const ModelSpec = z.strictObject({
  id: z.string(),
  label: z.string(),
  pricing: Pricing.optional(),
  /** Tokens the model can take in. */
  contextWindow: z.number().int().positive().optional(),
  /** The longest answer it can give, in tokens (reasoning included where the provider counts it). */
  maxOutput: z.number().int().positive().optional(),
  /** always: it always reasons; optional: it can be told how hard, or not at all; none: it doesn't reason. */
  reasoning: z
    .strictObject({
      mode: z.enum(["always", "optional", "none"]),
      efforts: z.array(EffortLevel).optional(),
      default: z.string().optional(),
      /** For models that take a thinking budget in tokens instead of a level (Gemini 2.5). */
      budget: z.strictObject({ min: z.number().int().min(0), max: z.number().int().positive() }).optional(),
    })
    .optional(),
  structured: z.enum(["json_schema", "json_object", "prompt_only"]).optional(),
  note: z.string().optional(),
});

const Auth = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("none") }),
  z.strictObject({ type: z.literal("bearer") }),
  z.strictObject({ type: z.literal("header"), headerName: z.string(), prefix: z.string().optional() }),
  z.strictObject({ type: z.literal("query"), paramName: z.string() }),
]);

export const Preset = z.strictObject({
  id: z.string(),
  kind: z.enum(["llm", "image"]),
  label: z.string(),
  description: z.string(),
  adapter: z.enum([
    "anthropic",
    "openai_compat",
    "gemini",
    "openai_images",
    "openai_compat_images",
    "google_imagen",
    "gemini_image",
    "stability",
    "replicate",
    "fal",
    "generic_http",
  ]),
  baseUrl: z.string().nullable(),
  baseUrlEditable: z.boolean(),
  selfHosted: z.boolean(),
  auth: Auth,
  needsKey: z.boolean(),
  keyUrl: z.string().optional(),
  capabilities: z
    .strictObject({
      structured: z.enum(["json_schema", "json_object", "prompt_only"]).optional(),
      promptCache: z.enum(["explicit", "implicit", "none"]).optional(),
      effort: z.boolean().optional(),
      serverFallbacks: z.boolean().optional(),
      maxTokensParam: z.enum(["max_tokens", "max_completion_tokens"]).optional(),
      reasoning: z
        .enum([
          "none",
          "reasoning_effort",
          "openrouter",
          "thinking_type",
          "reasoning_enabled",
          "enable_thinking",
        ])
        .optional(),
      /** Fields the provider's docs say to add to every request. */
      requestFields: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),
  models: z.array(ModelSpec).default([]),
  /** The provider's documentation these settings come from, and when it was read. */
  docs: z.array(z.string()).default([]),
  checked: z.string().optional(),
  /** The longest answer the provider gives when no limit is sent, where its docs say (Fireworks: 2048). */
  unsetLimit: z.number().int().positive().optional(),
  /** Shown when the provider is picked: why this project steers away from it. */
  avoid: z.string().optional(),
  defaultModels: z.record(z.string(), z.string()).default({}),
  defaultParams: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  genericSpec: GenericHttpSpecSchema.optional(),
});
export type Preset = z.infer<typeof Preset>;

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "presets");

function loadAll(): Preset[] {
  const out: Preset[] = [];
  for (const kind of ["llm", "image"]) {
    for (const file of readdirSync(join(DIR, kind))
      .filter((f) => f.endsWith(".yaml"))
      .sort()) {
      const parsed = Preset.safeParse(parse(readFileSync(join(DIR, kind, file), "utf8")));
      if (!parsed.success) throw new Error(`bad preset ${kind}/${file}: ${parsed.error.message}`);
      out.push(parsed.data);
    }
  }
  return out;
}

let cache: Preset[] | null = null;

export function presets(kind?: "llm" | "image"): Preset[] {
  cache ??= loadAll();
  return kind ? cache.filter((p) => p.kind === kind) : cache;
}

export function preset(id: string): Preset | undefined {
  return presets().find((p) => p.id === id);
}

/**
 * The hosted story service whose address this is (any path on the same host, such as Z.ai's Coding Plan
 * endpoint), so a custom endpoint pointed at it is called the way that service documents.
 */
export function documentedPresetFor(baseUrl: string | null): Preset | undefined {
  if (!baseUrl) return undefined;
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return undefined;
  }
  return presets("llm").find(
    (p) =>
      p.adapter === "openai_compat" &&
      !p.selfHosted &&
      !p.id.startsWith("custom-") &&
      p.baseUrl !== null &&
      new URL(p.baseUrl).host === host,
  );
}
