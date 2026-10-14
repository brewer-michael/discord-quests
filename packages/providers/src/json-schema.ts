import { z } from "zod";

type Json = Record<string, unknown>;

const UNSUPPORTED = [
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "default",
];

/**
 * A JSON Schema for strict structured outputs: every object closed and every
 * property required (optional fields are nullable in our schemas), with
 * keywords some providers reject removed.
 */
export function strictJsonSchema(schema: z.ZodType): Json {
  const raw = z.toJSONSchema(schema, { target: "draft-7", io: "output", unrepresentable: "any" }) as Json;
  return normalize(raw) as Json;
}

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (UNSUPPORTED.includes(k)) continue;
    out[k] = normalize(v);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Json);
  }
  return out;
}

/** Pulls the first JSON object out of free text (for providers without structured outputs). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1));
}
