import { applyAuth, joinUrl, requestBytes, requestJson, sleep } from "../http";
import { getPath, renderTemplate } from "../template";
import {
  type CallContext,
  type ImageAdapter,
  type ImageRequest,
  type ImageResult,
  ProviderError,
  type ResolvedProviderConfig,
} from "../types";

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ""), "base64"));
}

function sniffMime(bytes: Uint8Array): ImageResult["mime"] {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "image/png";
}

function asResult(bytes: Uint8Array, revisedPrompt?: string): ImageResult {
  if (bytes.byteLength < 100) throw new ProviderError("image was empty", true);
  return { bytes, mime: sniffMime(bytes), ...(revisedPrompt ? { revisedPrompt } : {}) };
}

function aspect(req: ImageRequest): string {
  const r = req.width / req.height;
  if (r > 1.6) return "16:9";
  if (r > 1.2) return "3:2";
  if (r < 0.75) return "2:3";
  return "1:1";
}

function promptWithAvoid(req: ImageRequest): string {
  return `${req.prompt} Avoid: ${req.negativePrompt}.`;
}

async function download(ctx: CallContext, url: string): Promise<Uint8Array> {
  return (await requestBytes(ctx.fetch, url)).bytes;
}

/** OpenAI image generation (gpt-image models) and compatible /images/generations endpoints. */
function openAiImages(id: "openai_images" | "openai_compat_images"): ImageAdapter {
  return {
    id,
    async generate(req, cfg, ctx) {
      const base = cfg.baseUrl ?? "https://api.openai.com/v1";
      const size = req.width > req.height ? "1536x1024" : req.width < req.height ? "1024x1536" : "1024x1024";
      const body: Record<string, unknown> = { model: req.model, prompt: promptWithAvoid(req), n: 1, size };
      if (id === "openai_images" && req.model.startsWith("gpt-image")) body.moderation = "auto";
      else body.response_format = "b64_json";
      const res = (await requestJson(ctx.fetch, cfg, joinUrl(base, "images/generations"), {
        body,
        signal: ctx.signal,
      })) as {
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
      };
      const item = res.data?.[0];
      if (item?.b64_json) return asResult(b64ToBytes(item.b64_json), item.revised_prompt);
      if (item?.url) return asResult(await download(ctx, item.url), item.revised_prompt);
      throw new ProviderError("no image in response", false);
    },
  };
}

export const openAiImagesAdapter = openAiImages("openai_images");
export const openAiCompatImagesAdapter = openAiImages("openai_compat_images");

/** Google Imagen through the Gemini API. People are not generated, for a child audience. */
export const googleImagenAdapter: ImageAdapter = {
  id: "google_imagen",
  async generate(req, cfg, ctx) {
    const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const res = (await requestJson(
      ctx.fetch,
      cfg,
      joinUrl(base, `models/${encodeURIComponent(req.model)}:predict`),
      {
        body: {
          instances: [{ prompt: promptWithAvoid(req) }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspect(req) === "3:2" ? "4:3" : aspect(req),
            personGeneration: "allow_all",
          },
        },
        signal: ctx.signal,
      },
    )) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
    const b64 = res.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new ProviderError("no image in response (it may have been filtered)", false);
    return asResult(b64ToBytes(b64));
  },
};

/** Gemini native image output. */
export const geminiImageAdapter: ImageAdapter = {
  id: "gemini_image",
  async generate(req, cfg, ctx) {
    const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const res = (await requestJson(
      ctx.fetch,
      cfg,
      joinUrl(base, `models/${encodeURIComponent(req.model)}:generateContent`),
      {
        body: {
          contents: [{ role: "user", parts: [{ text: promptWithAvoid(req) }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        },
        signal: ctx.signal,
      },
    )) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
    const b64 = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new ProviderError("no image in response (it may have been filtered)", false);
    return asResult(b64ToBytes(b64));
  },
};

/** Stability AI Stable Image (core, ultra, sd3). The model id is the endpoint name. */
export const stabilityAdapter: ImageAdapter = {
  id: "stability",
  async generate(req, cfg, ctx) {
    const base = cfg.baseUrl ?? "https://api.stability.ai/v2beta/stable-image/generate";
    const url = new URL(joinUrl(base, req.model || "core"));
    const headers: Record<string, string> = { accept: "image/*", ...cfg.extraHeaders };
    applyAuth(cfg, url, headers);
    const form = new FormData();
    form.set("prompt", req.prompt);
    form.set("negative_prompt", req.negativePrompt);
    form.set("aspect_ratio", aspect(req));
    form.set("output_format", "png");
    if (req.seed !== undefined) form.set("seed", String(req.seed));
    const res = await ctx.fetch(url, {
      method: "POST",
      headers,
      body: form,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    if (!res.ok)
      throw new ProviderError(
        `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
        res.status >= 500 || res.status === 429,
        res.status,
      );
    return asResult(new Uint8Array(await res.arrayBuffer()));
  },
};

/** Replicate models (e.g. FLUX). Waits synchronously when it can, then polls. */
export const replicateAdapter: ImageAdapter = {
  id: "replicate",
  async generate(req, cfg, ctx) {
    const base = cfg.baseUrl ?? "https://api.replicate.com/v1";
    const [owner, name] = req.model.split("/");
    if (!owner || !name) throw new ProviderError('Replicate models look like "owner/name"', false);
    type Prediction = { status?: string; output?: unknown; error?: string; urls?: { get?: string } };
    let p = (await requestJson(ctx.fetch, cfg, joinUrl(base, `models/${owner}/${name}/predictions`), {
      body: {
        input: {
          prompt: req.prompt,
          aspect_ratio: aspect(req),
          output_format: "png",
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        },
      },
      headers: { prefer: "wait=60" },
      signal: ctx.signal,
    })) as Prediction;
    const deadline = Date.now() + 120_000;
    while (p.status !== "succeeded") {
      if (p.status === "failed" || p.status === "canceled")
        throw new ProviderError(`prediction ${p.status}: ${p.error ?? ""}`, false);
      if (!p.urls?.get || Date.now() > deadline) throw new ProviderError("prediction timed out", true);
      await sleep(1500);
      p = (await requestJson(ctx.fetch, cfg, p.urls.get, { signal: ctx.signal })) as Prediction;
    }
    const out = Array.isArray(p.output) ? p.output[0] : p.output;
    if (typeof out !== "string") throw new ProviderError("no image in prediction output", false);
    return asResult(await download(ctx, out));
  },
};

/** fal.ai queue API. */
export const falAdapter: ImageAdapter = {
  id: "fal",
  async generate(req, cfg, ctx) {
    const base = cfg.baseUrl ?? "https://queue.fal.run";
    type Queued = { request_id?: string; status_url?: string; response_url?: string };
    const q = (await requestJson(ctx.fetch, cfg, joinUrl(base, req.model), {
      body: {
        prompt: req.prompt,
        image_size: req.width >= req.height ? "landscape_4_3" : "portrait_4_3",
        num_images: 1,
        enable_safety_checker: true,
      },
      signal: ctx.signal,
    })) as Queued;
    if (!q.status_url || !q.response_url) throw new ProviderError("fal did not queue the request", true);
    const deadline = Date.now() + 120_000;
    for (;;) {
      const s = (await requestJson(ctx.fetch, cfg, q.status_url, { signal: ctx.signal })) as {
        status?: string;
      };
      if (s.status === "COMPLETED") break;
      if (s.status === "FAILED" || s.status === "ERROR") throw new ProviderError("fal request failed", false);
      if (Date.now() > deadline) throw new ProviderError("fal request timed out", true);
      await sleep(1500);
    }
    const r = (await requestJson(ctx.fetch, cfg, q.response_url, { signal: ctx.signal })) as {
      images?: Array<{ url?: string }>;
      has_nsfw_concepts?: boolean[];
    };
    if (r.has_nsfw_concepts?.some(Boolean))
      throw new ProviderError("image was flagged by the provider's safety checker", false);
    const url = r.images?.[0]?.url;
    if (!url) throw new ProviderError("no image in response", false);
    return asResult(url.startsWith("data:") ? b64ToBytes(url) : await download(ctx, url));
  },
};

export const GENERIC_VARS = [
  "baseUrl",
  "prompt",
  "negativePrompt",
  "width",
  "height",
  "seed",
  "model",
  "id",
] as const;
export const GENERIC_NUMERIC = ["width", "height", "seed"] as const;

/** Any HTTP image endpoint, described by a templated request and a response mapping. */
export const genericHttpAdapter: ImageAdapter = {
  id: "generic_http",
  async generate(req, cfg, ctx) {
    const spec = cfg.genericSpec;
    if (!spec) throw new ProviderError("this custom endpoint has no request template", false);
    const vars = {
      baseUrl: cfg.baseUrl ?? "",
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      width: req.width,
      height: req.height,
      seed: req.seed ?? Math.floor(Math.random() * 2 ** 31),
      model: req.model,
    };
    const url = renderTemplate(spec.request.url, vars, "url");
    const body = spec.request.body ? renderTemplate(spec.request.body, vars, "body") : undefined;
    const first = await requestJson(ctx.fetch, cfg, url, {
      method: spec.request.method,
      ...(body !== undefined ? { body: JSON.parse(body) } : {}),
      ...(spec.request.headers ? { headers: spec.request.headers } : {}),
      signal: ctx.signal,
    });
    const pick = async (obj: unknown, b64Path?: string, urlPath?: string) => {
      const b64 = b64Path ? getPath(obj, b64Path) : undefined;
      if (typeof b64 === "string" && b64.length > 0) return asResult(b64ToBytes(b64));
      const link = urlPath ? getPath(obj, urlPath) : undefined;
      if (typeof link === "string") return asResult(await download(ctx, link));
      throw new ProviderError("couldn't find the image in the response (check the response paths)", false);
    };
    if (spec.response.mode === "sync")
      return pick(first, spec.response.imageBase64Path, spec.response.imageUrlPath);
    const r = spec.response;
    const id = getPath(first, r.idPath);
    if (typeof id !== "string" && typeof id !== "number")
      throw new ProviderError("no job id in response", false);
    const statusUrl = renderTemplate(r.statusUrl, { ...vars, id: String(id) }, "url");
    const deadline = Date.now() + (r.timeoutMs ?? 120_000);
    for (;;) {
      const s = await requestJson(ctx.fetch, cfg, statusUrl, { signal: ctx.signal });
      const status = String(getPath(s, r.statusPath) ?? "");
      if (r.done.includes(status)) return pick(s, r.resultBase64Path, r.resultUrlPath);
      if (r.failed.includes(status)) throw new ProviderError(`job ${status}`, false);
      if (Date.now() > deadline) throw new ProviderError("job timed out", true);
      await sleep(r.intervalMs ?? 2000);
    }
  },
};

export const IMAGE_ADAPTERS: ImageAdapter[] = [
  openAiImagesAdapter,
  openAiCompatImagesAdapter,
  googleImagenAdapter,
  geminiImageAdapter,
  stabilityAdapter,
  replicateAdapter,
  falAdapter,
  genericHttpAdapter,
];

export function _testOnly() {
  return { sniffMime, aspect };
}

export type { ResolvedProviderConfig };
