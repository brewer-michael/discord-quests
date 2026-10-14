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
    })
    .default({}),
  models: z
    .array(z.strictObject({ id: z.string(), label: z.string(), pricing: Pricing.optional() }))
    .default([]),
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
