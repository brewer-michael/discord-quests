import { ProviderError, type ResolvedProviderConfig } from "./types";

/** Headers (and URL changes) for a provider's auth style. */
export function applyAuth(cfg: ResolvedProviderConfig, url: URL, headers: Record<string, string>): void {
  const key = cfg.apiKey;
  if (!key) return;
  switch (cfg.auth.type) {
    case "bearer":
      headers.authorization = `Bearer ${key}`;
      break;
    case "header":
      headers[cfg.auth.headerName.toLowerCase()] = `${cfg.auth.prefix ?? ""}${key}`;
      break;
    case "query":
      url.searchParams.set(cfg.auth.paramName, key);
      break;
    case "none":
      break;
  }
}

export async function requestJson(
  fetchFn: typeof fetch,
  cfg: ResolvedProviderConfig,
  urlString: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
): Promise<unknown> {
  const url = new URL(urlString);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...cfg.extraHeaders,
    ...init.headers,
  };
  applyAuth(cfg, url, headers);
  const res = await fetchFn(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ProviderError(
      `HTTP ${res.status}: ${text.slice(0, 300)}`,
      res.status === 429 || res.status >= 500,
      res.status,
    );
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderError("response was not JSON", false, res.status);
  }
}

export async function requestBytes(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetchFn(url, init);
  if (!res.ok) throw new ProviderError(`HTTP ${res.status} downloading image`, res.status >= 500, res.status);
  const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0] ?? "image/png";
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
