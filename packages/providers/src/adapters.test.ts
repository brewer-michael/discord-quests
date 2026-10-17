import { NarratorOutput } from "@dq/core/narration";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { anthropicAdapter } from "./adapters/anthropic";
import { geminiAdapter, thinkingConfig } from "./adapters/gemini";
import {
  falAdapter,
  genericHttpAdapter,
  openAiImagesAdapter,
  replicateAdapter,
  stabilityAdapter,
} from "./adapters/images";
import { openAiCompatAdapter } from "./adapters/openai-compat";
import { extractJson, strictJsonSchema } from "./json-schema";
import { presets } from "./presets";
import { budgetFor, effortFor, reasoningFields, withoutThinking } from "./reasoning";
import { getPath, renderTemplate, validateTemplate } from "./template";
import { fakeFetch, json, PNG, PNG_B64 } from "./test-fetch";
import type { ResolvedProviderConfig, StructuredRequest } from "./types";

const Small = z.object({ answer: z.string(), score: z.number().nullable() });
const req = (
  over: Partial<StructuredRequest<z.infer<typeof Small>>> = {},
): StructuredRequest<z.infer<typeof Small>> => ({
  task: "narrator",
  model: "claude-opus-5-5",
  system: [{ text: "You are a storyteller.", cache: "1h" }],
  user: [{ text: "Party and story so far.", cache: "5m" }, { text: "This turn." }],
  schema: Small,
  schemaName: "small",
  maxOutputTokens: 16000,
  ...over,
});
const cfg = (over: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig => ({
  id: "c1",
  name: "test",
  presetId: "anthropic",
  adapterId: "anthropic",
  baseUrl: null,
  auth: { type: "bearer" },
  apiKey: "sk-test",
  extraHeaders: {},
  selfHosted: false,
  capabilities: {},
  pricing: {},
  maxOutput: {},
  models: {},
  genericSpec: null,
  ...over,
});
const anthropicMessage = (text: string, extra: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text },
  ],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 80,
    cache_creation_input_tokens: 0,
  },
  ...extra,
});

describe("strict JSON schema", () => {
  it("closes every object and requires every property", () => {
    const schema = strictJsonSchema(NarratorOutput);
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.type === "object" && o.properties) {
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(schema);
    expect(JSON.stringify(schema)).not.toContain("$schema");
  });

  it("extracts JSON from chatty replies", () => {
    expect(extractJson('Sure! ```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here: {"a": {"b": 2}} done')).toEqual({ a: { b: 2 } });
  });
});

describe("Anthropic adapter", () => {
  it("sends structured output, caching, effort and server-side fallbacks, and never disables thinking", async () => {
    const { fetch, calls } = fakeFetch(() => json(anthropicMessage('{"answer":"hi","score":null}')));
    const res = await anthropicAdapter.generateStructured(req({ effort: "low" }), cfg(), { fetch });
    expect(res).toMatchObject({
      ok: true,
      value: { answer: "hi", score: null },
      usage: { cacheReadTokens: 80 },
    });
    const body = calls[0]!.body as Record<string, unknown>;
    expect(calls[0]?.url.pathname).toBe("/v1/messages");
    expect(calls[0]?.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(body.fallbacks).toBe("default");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect((body.system as Array<Record<string, unknown>>)[0]?.cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
    const content = (body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]?.content ?? [];
    expect(content[0]?.cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
    expect(content[1]).not.toHaveProperty("cache_control");
  });

  it("omits fallbacks for models and endpoints that don't support them", async () => {
    const { fetch, calls } = fakeFetch(() => json(anthropicMessage('{"answer":"hi","score":1}')));
    await anthropicAdapter.generateStructured(req({ model: "claude-haiku-5-5" }), cfg(), { fetch });
    expect(calls[0]?.body).not.toHaveProperty("fallbacks");
    await anthropicAdapter.generateStructured(req(), cfg({ baseUrl: "https://proxy.example" }), { fetch });
    expect(calls[1]?.body).not.toHaveProperty("fallbacks");
  });

  it("reports refusals, truncation and invalid output without retrying elsewhere", async () => {
    for (const [stop, expected] of [
      ["refusal", "refusal"],
      ["max_tokens", "max_tokens"],
    ] as const) {
      const { fetch } = fakeFetch(() => json(anthropicMessage("{}", { stop_reason: stop })));
      expect(await anthropicAdapter.generateStructured(req(), cfg(), { fetch })).toMatchObject({
        ok: false,
        stop: expected,
        retryable: false,
      });
    }
    const { fetch } = fakeFetch(() => json(anthropicMessage('{"wrong": true}')));
    expect(await anthropicAdapter.generateStructured(req(), cfg(), { fetch })).toMatchObject({
      ok: false,
      stop: "invalid",
    });
  });

  it("detects a fallback model having served the turn", async () => {
    const { fetch } = fakeFetch(() =>
      json(
        anthropicMessage('{"answer":"hi","score":1}', {
          usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "fallback_message" }] },
        }),
      ),
    );
    expect(await anthropicAdapter.generateStructured(req(), cfg(), { fetch })).toMatchObject({
      ok: true,
      fellBack: true,
    });
  });

  it("marks server errors retryable and auth errors not", async () => {
    const auth = fakeFetch(() =>
      json({ type: "error", error: { type: "authentication_error", message: "bad key" } }, 401),
    );
    expect(await anthropicAdapter.generateStructured(req(), cfg(), { fetch: auth.fetch })).toMatchObject({
      ok: false,
      retryable: false,
    });
  });
});

describe("OpenAI-compatible adapter", () => {
  const ccfg = (structured: "json_schema" | "json_object" | "prompt_only") =>
    cfg({ adapterId: "openai_compat", baseUrl: "https://llm.example/v1", capabilities: { structured } });
  const reply = (content: string, finish = "stop") =>
    json({
      model: "m",
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    });

  it("uses strict json_schema when supported", async () => {
    const { fetch, calls } = fakeFetch(() => reply('{"answer":"yes","score":2}'));
    const res = await openAiCompatAdapter.generateStructured(req({ model: "m" }), ccfg("json_schema"), {
      fetch,
    });
    expect(res).toMatchObject({ ok: true, value: { answer: "yes" } });
    expect(calls[0]?.url.toString()).toBe("https://llm.example/v1/chat/completions");
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-test");
    expect(
      (calls[0]!.body as { response_format: { type: string; json_schema: { strict: boolean } } })
        .response_format,
    ).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
  });

  it("falls back to json_object with the schema in the prompt, and to prompt-only extraction", async () => {
    const a = fakeFetch(() => reply('{"answer":"ok","score":null}'));
    await openAiCompatAdapter.generateStructured(req({ model: "m" }), ccfg("json_object"), {
      fetch: a.fetch,
    });
    const body = a.calls[0]!.body as {
      response_format: { type: string };
      messages: Array<{ content: string }>;
    };
    expect(body.response_format.type).toBe("json_object");
    expect(body.messages[0]?.content).toContain("JSON Schema");
    const b = fakeFetch(() => reply('Here you go: {"answer":"ok","score":null}'));
    expect(
      await openAiCompatAdapter.generateStructured(req({ model: "m" }), ccfg("prompt_only"), {
        fetch: b.fetch,
      }),
    ).toMatchObject({ ok: true });
  });

  it("maps truncation and content filters", async () => {
    const { fetch } = fakeFetch(() => reply("{", "length"));
    expect(
      await openAiCompatAdapter.generateStructured(req({ model: "m" }), ccfg("json_schema"), { fetch }),
    ).toMatchObject({ stop: "max_tokens" });
    const f = fakeFetch(() => reply("", "content_filter"));
    expect(
      await openAiCompatAdapter.generateStructured(req({ model: "m" }), ccfg("json_schema"), {
        fetch: f.fetch,
      }),
    ).toMatchObject({ stop: "filtered" });
    const s = fakeFetch(() => json({ error: "overloaded" }, 503));
    expect(
      await openAiCompatAdapter.generateStructured(req({ model: "m" }), ccfg("json_schema"), {
        fetch: s.fetch,
      }),
    ).toMatchObject({ retryable: true });
  });
});

describe("reasoning settings", () => {
  it("sends the level in each provider's own format", () => {
    expect(reasoningFields("reasoning_effort", "medium")).toEqual({ reasoning_effort: "medium" });
    expect(reasoningFields("openrouter", "xhigh", ["xhigh"])).toEqual({ reasoning: { effort: "xhigh" } });
    expect(reasoningFields("thinking_type", "max", ["low", "high", "max"])).toEqual({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    });
    // A model that only switches thinking on or off gets no level.
    expect(reasoningFields("thinking_type", "high")).toEqual({ thinking: { type: "enabled" } });
    expect(reasoningFields("thinking_type", "none")).toEqual({ thinking: { type: "disabled" } });
    expect(reasoningFields("reasoning_enabled", "none")).toEqual({ reasoning: { enabled: false } });
    expect(reasoningFields("reasoning_enabled", "low")).toEqual({ reasoning_effort: "low" });
    expect(reasoningFields("enable_thinking", "none")).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(reasoningFields("none", "high")).toEqual({});
    expect(reasoningFields("reasoning_effort", undefined)).toEqual({});
    // Without a documented list, only the levels every reasoning_effort service takes.
    expect(reasoningFields("reasoning_effort", "max")).toEqual({ reasoning_effort: "high" });
    expect(reasoningFields("reasoning_effort", "minimal")).toEqual({ reasoning_effort: "low" });
  });

  it("picks the documented level nearest the one asked for", () => {
    const sol = {
      reasoning: { mode: "always" as const, efforts: ["low", "medium", "high", "xhigh", "max"] as const },
    };
    const spec = { reasoning: { ...sol.reasoning, efforts: [...sol.reasoning.efforts] } };
    expect(effortFor(spec, "minimal")).toBe("low");
    // A model that always reasons is never switched off: the lightest level instead.
    expect(effortFor(spec, "none")).toBe("low");
    expect(effortFor({ reasoning: { mode: "optional", efforts: ["none", "high"] } }, "low")).toBe("high");
    expect(effortFor({ reasoning: { mode: "optional", efforts: ["none", "high"] } }, "none")).toBe("none");
    expect(effortFor({ reasoning: { mode: "none" } }, "high")).toBeUndefined();
    expect(effortFor(undefined, "medium")).toBe("medium");
    expect(effortFor(spec, undefined)).toBeUndefined();
  });

  it("turns a level into a thinking budget within the documented range", () => {
    expect(budgetFor({ min: 0, max: 24576 }, "none", "optional")).toBe(0);
    expect(budgetFor({ min: 128, max: 32768 }, "none", "always")).toBe(128);
    expect(budgetFor({ min: 0, max: 24576 }, "medium", "optional")).toBe(12288);
    expect(budgetFor({ min: 128, max: 32768 }, "max", "always")).toBe(32768);
    expect(budgetFor({ min: 512, max: 24576 }, "minimal", "optional")).toBe(2458);
  });

  it("reads the answer past reasoning left inline", () => {
    expect(withoutThinking('<think>hmm, {"a":1}?</think>\n{"answer":"x"}')).toBe('{"answer":"x"}');
    expect(withoutThinking('<thinking>x</thinking>{"b":2}')).toBe('{"b":2}');
  });
});

describe("OpenAI-compatible adapter: what each provider documents", () => {
  const reply = (content: unknown) =>
    json({ model: "m", choices: [{ finish_reason: "stop", message: { content } }], usage: {} });

  it("sends a documented model's level, the provider's limit field, and its required fields", async () => {
    const { fetch, calls } = fakeFetch(() => reply('{"answer":"yes","score":2}'));
    await openAiCompatAdapter.generateStructured(
      req({ model: "gpt-6.1-sol", effort: "minimal", maxOutputTokens: 128000 }),
      cfg({
        adapterId: "openai_compat",
        capabilities: {
          structured: "json_schema",
          reasoning: "reasoning_effort",
          maxTokensParam: "max_completion_tokens",
          requestFields: { provider: { require_parameters: true } },
        },
        models: {
          "gpt-6.1-sol": {
            reasoning: { mode: "always", efforts: ["low", "medium", "high", "xhigh", "max"] },
          },
        },
      }),
      { fetch },
    );
    expect(calls[0]?.body).toMatchObject({
      reasoning_effort: "low",
      max_completion_tokens: 128000,
      provider: { require_parameters: true },
    });
    expect(calls[0]?.body).not.toHaveProperty("max_tokens");
  });

  it("sends no limit when none is set, and nothing about reasoning to a model that doesn't reason", async () => {
    const { fetch, calls } = fakeFetch(() => reply('{"answer":"yes","score":2}'));
    await openAiCompatAdapter.generateStructured(
      req({ model: "mistral-large-2512", effort: "high", maxOutputTokens: undefined }),
      cfg({
        adapterId: "openai_compat",
        capabilities: { structured: "json_schema", reasoning: "reasoning_effort" },
        models: { "mistral-large-2512": { reasoning: { mode: "none" } } },
      }),
      { fetch },
    );
    const body = calls[0]?.body as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("max_tokens");
    expect(Object.keys(body)).not.toContain("reasoning_effort");
  });

  it("uses a model's own structured-output mode over the provider's", async () => {
    const { fetch, calls } = fakeFetch(() => reply('{"answer":"yes","score":2}'));
    await openAiCompatAdapter.generateStructured(
      req({ model: "openai/gpt-oss-120b" }),
      cfg({
        adapterId: "openai_compat",
        capabilities: { structured: "json_object" },
        models: { "openai/gpt-oss-120b": { structured: "json_schema" } },
      }),
      { fetch },
    );
    expect(calls[0]?.body).toMatchObject({ response_format: { type: "json_schema" } });
  });

  it("reads the text chunks of an answer that comes back in chunks", async () => {
    const { fetch } = fakeFetch(() =>
      reply([
        { type: "thinking", thinking: [{ type: "text", text: "Let me think {about it}" }] },
        { type: "text", text: '{"answer":"chunked",' },
        { type: "text", text: '"score":1}' },
      ]),
    );
    expect(
      await openAiCompatAdapter.generateStructured(
        req({ model: "mistral-small-2603" }),
        cfg({ adapterId: "openai_compat", capabilities: { structured: "json_schema" } }),
        { fetch },
      ),
    ).toMatchObject({ ok: true, value: { answer: "chunked" } });
  });

  it("reads past reasoning a server leaves inline", async () => {
    const { fetch } = fakeFetch(() => reply('<think>{"answer":"draft"}</think>{"answer":"final","score":0}'));
    expect(
      await openAiCompatAdapter.generateStructured(
        req({ model: "local" }),
        cfg({ adapterId: "openai_compat", capabilities: { structured: "json_schema" } }),
        { fetch },
      ),
    ).toMatchObject({ ok: true, value: { answer: "final" } });
  });
});

describe("Gemini adapter", () => {
  it("asks for JSON with a schema and strict safety", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"answer":"g","score":1}' }] } }],
        usageMetadata: { promptTokenCount: 9 },
      }),
    );
    const res = await geminiAdapter.generateStructured(
      req({ model: "gemini-x" }),
      cfg({ adapterId: "gemini", auth: { type: "header", headerName: "x-goog-api-key" } }),
      {
        fetch,
      },
    );
    expect(res).toMatchObject({ ok: true, value: { answer: "g" } });
    expect(calls[0]?.url.pathname).toContain("models/gemini-x:generateContent");
    expect(calls[0]?.headers["x-goog-api-key"]).toBe("sk-test");
    const body = calls[0]!.body as {
      generationConfig: { responseMimeType: string };
      safetySettings: unknown[];
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.safetySettings.length).toBeGreaterThan(0);
  });

  it("sets a thinking level on Gemini 3 and later, a budget on 2.5, and never both", () => {
    const flash = {
      reasoning: {
        mode: "always" as const,
        efforts: ["low", "medium", "high"] as Array<"low" | "medium" | "high">,
      },
    };
    expect(thinkingConfig(flash, "minimal")).toEqual({ thinkingLevel: "low" });
    expect(thinkingConfig(flash, "max")).toEqual({ thinkingLevel: "high" });
    const pro25 = {
      reasoning: {
        mode: "always" as const,
        efforts: ["minimal", "low", "medium", "high", "max"] as Array<
          "minimal" | "low" | "medium" | "high" | "max"
        >,
        budget: { min: 128, max: 32768 },
      },
    };
    expect(thinkingConfig(pro25, "high")).toEqual({ thinkingBudget: 24576 });
    expect(thinkingConfig(pro25, "none")).toEqual({ thinkingBudget: 128 });
    expect(thinkingConfig(undefined, "high")).toBeUndefined();
    expect(thinkingConfig(flash, undefined)).toBeUndefined();
  });

  it("sends the thinking setting, skips thought parts, and counts thinking as output", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: "planning…", thought: true }, { text: '{"answer":"g","score":1}' }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 10, thoughtsTokenCount: 30 },
      }),
    );
    const res = await geminiAdapter.generateStructured(
      req({ model: "gemini-3.8-flash", effort: "medium", maxOutputTokens: 65536 }),
      cfg({
        adapterId: "gemini",
        models: { "gemini-3.8-flash": { reasoning: { mode: "always", efforts: ["low", "medium", "high"] } } },
      }),
      { fetch },
    );
    expect(res).toMatchObject({ ok: true, value: { answer: "g" }, usage: { outputTokens: 40 } });
    expect(calls[0]?.body).toMatchObject({
      generationConfig: { maxOutputTokens: 65536, thinkingConfig: { thinkingLevel: "medium" } },
    });
  });
});

describe("image adapters", () => {
  const img = {
    prompt: "a misty marsh",
    negativePrompt: "text",
    width: 1536,
    height: 1024,
    model: "gpt-image-1",
  };

  it("OpenAI images returns decoded bytes", async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: [{ b64_json: PNG_B64 }] }));
    const out = await openAiImagesAdapter.generate(
      img,
      cfg({ adapterId: "openai_images", baseUrl: "https://api.openai.com/v1" }),
      { fetch },
    );
    expect(out.mime).toBe("image/png");
    expect((calls[0]!.body as { size: string; moderation: string }).size).toBe("1536x1024");
    expect((calls[0]!.body as { moderation: string }).moderation).toBe("auto");
  });

  it("Replicate polls until the prediction succeeds, then downloads", async () => {
    let polls = 0;
    const { fetch } = fakeFetch((r) => {
      if (r.method === "POST")
        return json({ status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1" } });
      if (r.url.pathname.endsWith("/p1"))
        return json(
          ++polls < 2
            ? { status: "processing", urls: { get: r.url.toString() } }
            : { status: "succeeded", output: ["https://cdn.example/out.png"] },
        );
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    });
    const out = await replicateAdapter.generate(
      { ...img, model: "black-forest-labs/flux-schnell" },
      cfg({ adapterId: "replicate" }),
      { fetch },
    );
    expect(out.bytes.byteLength).toBe(PNG.byteLength);
  }, 10_000);

  it("fal uses the queue and refuses flagged images", async () => {
    const queued = (flagged: boolean) =>
      fakeFetch((r) => {
        if (r.method === "POST")
          return json({
            request_id: "r",
            status_url: "https://queue.fal.run/x/status",
            response_url: "https://queue.fal.run/x/resp",
          });
        if (r.url.pathname.endsWith("/status")) return json({ status: "COMPLETED" });
        if (r.url.pathname.endsWith("/resp"))
          return json({ images: [{ url: "https://cdn.example/i.png" }], has_nsfw_concepts: [flagged] });
        return new Response(PNG);
      });
    const auth = cfg({
      adapterId: "fal",
      auth: { type: "header", headerName: "authorization", prefix: "Key " },
    });
    const good = queued(false);
    await falAdapter.generate({ ...img, model: "fal-ai/flux/schnell" }, auth, { fetch: good.fetch });
    expect(good.calls[0]?.headers.authorization).toBe("Key sk-test");
    await expect(
      falAdapter.generate({ ...img, model: "fal-ai/flux/schnell" }, auth, { fetch: queued(true).fetch }),
    ).rejects.toThrow(/safety/);
  });

  it("Stability posts multipart and reads image bytes", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(PNG, { headers: { "content-type": "image/png" } }));
    await stabilityAdapter.generate(
      { ...img, model: "core" },
      cfg({ adapterId: "stability", baseUrl: "https://api.stability.ai/v2beta/stable-image/generate" }),
      { fetch },
    );
    expect(calls[0]?.url.pathname).toBe("/v2beta/stable-image/generate/core");
    expect(calls[0]?.headers.accept).toBe("image/*");
  });

  it("generic HTTP renders templates and follows response paths", async () => {
    const a1111 = presets("image").find((p) => p.id === "automatic1111");
    const { fetch, calls } = fakeFetch(() => json({ images: [PNG_B64] }));
    const out = await genericHttpAdapter.generate(
      { ...img, model: "default", seed: 42 },
      cfg({
        adapterId: "generic_http",
        baseUrl: "http://sd.local:7860/",
        auth: { type: "none" },
        genericSpec: a1111?.genericSpec as never,
      }),
      { fetch },
    );
    expect(out.mime).toBe("image/png");
    expect(calls[0]?.url.toString()).toBe("http://sd.local:7860/sdapi/v1/txt2img");
    expect(calls[0]?.body).toMatchObject({ prompt: "a misty marsh", width: 1536, seed: 42 });
  });
});

describe("templates", () => {
  it("quotes strings safely and validates bodies", () => {
    expect(
      renderTemplate('{"p": {{json prompt}}, "w": {{width}}}', { prompt: 'say "hi"', width: 5 }, "body"),
    ).toBe('{"p": "say \\"hi\\"", "w": 5}');
    expect(validateTemplate('{"p": {{prompt}}}', ["prompt"], [], "body")[0]).toContain("{{json prompt}}");
    expect(validateTemplate("{{nope}}", ["prompt"], [], "url")[0]).toContain("unknown");
    expect(() => renderTemplate('{"p": {{prompt}}}', { prompt: "x" }, "body")).toThrow();
  });

  it("supports only simple paths", () => {
    expect(getPath({ a: { b: [{ c: 1 }] } }, "$.a.b[0].c")).toBe(1);
    expect(() => getPath({}, "$..evil")).toThrow();
    expect(() => getPath({}, "$.a[?(@.x)]")).toThrow();
  });
});

describe("presets", () => {
  it("load and cover story and image providers", () => {
    const llm = presets("llm").map((p) => p.id);
    const image = presets("image").map((p) => p.id);
    expect(llm).toEqual(
      expect.arrayContaining(["anthropic", "openai", "openrouter", "gemini", "ollama", "custom-openai"]),
    );
    expect(image).toEqual(
      expect.arrayContaining([
        "openai-images",
        "stability",
        "replicate",
        "fal",
        "automatic1111",
        "custom-http",
      ]),
    );
    expect(presets("llm").find((p) => p.id === "anthropic")?.defaultModels.narrator).toBe("claude-opus-5-5");
  });

  it("describe each documented model consistently", () => {
    for (const p of presets("llm")) {
      for (const m of p.models) {
        const r = m.reasoning;
        if (r?.default && r.efforts) expect(r.efforts, `${p.id} ${m.id}`).toContain(r.default);
        if (r?.mode === "always") expect(r.efforts ?? [], `${p.id} ${m.id}`).not.toContain("none");
        if (r?.mode === "optional" && r.efforts?.length)
          expect(r.efforts, `${p.id} ${m.id}`).toContain("none");
        if (m.maxOutput && m.contextWindow) expect(m.maxOutput).toBeLessThanOrEqual(m.contextWindow);
      }
      if (p.models.length > 0 && p.id !== "anthropic") {
        expect(p.docs.length, p.id).toBeGreaterThan(0);
        expect(p.checked, p.id).toBeTruthy();
      }
      for (const id of Object.values(p.defaultModels))
        if (p.models.length > 0)
          expect(
            p.models.map((m) => m.id),
            `${p.id} default`,
          ).toContain(id);
    }
  });

  it("send reasoning only in a form each provider documents", () => {
    const style = (id: string) => presets("llm").find((p) => p.id === id)?.capabilities.reasoning;
    expect(style("openai")).toBe("reasoning_effort");
    expect(style("openrouter")).toBe("openrouter");
    expect(style("zai")).toBe("reasoning_effort");
    expect(style("deepseek")).toBe("thinking_type");
    expect(style("together")).toBe("reasoning_enabled");
    expect(style("lmstudio")).toBe("none");
  });

  it("steer away from Anthropic", () => {
    const a = presets("llm").find((p) => p.id === "anthropic");
    expect(a?.avoid).toMatch(/avoid at all costs/i);
    expect(a?.label).not.toMatch(/recommended/i);
  });
});
