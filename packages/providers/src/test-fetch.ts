export interface Captured {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch stand-in that records requests and answers from a handler. */
export function fakeFetch(handler: (req: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers: Record<string, string> = {};
    new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => {
      headers[k] = v;
    });
    let body: unknown = init.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep text */
      }
    }
    const req = { url, method: (init.method ?? "GET").toUpperCase(), headers, body };
    calls.push(req);
    return handler(req);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** A tiny but valid-looking PNG payload (signature + padding). */
export const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(200).fill(7),
]);
export const PNG_B64 = Buffer.from(PNG).toString("base64");
