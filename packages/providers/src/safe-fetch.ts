import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * fetch() for URLs that came from configuration (custom endpoints, image URLs
 * returned by providers). Blocks private and internal addresses, pins each
 * connection to the address it validated (no DNS rebinding), re-checks every
 * redirect, and caps response sizes and time.
 */

export interface SafeFetchOptions {
  allowPrivate?: boolean;
  allowHttp?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  lookup?: (host: string) => Promise<Array<{ address: string; family: number }>>;
  /** For tests: performs the request after validation. */
  transport?: typeof undiciFetch;
}

export class BlockedUrlError extends Error {}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inV4(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/") as [string, string];
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

const PRIVATE_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

function expandV6(ip: string): number[] {
  const [head, tail] = ip.toLowerCase().split("::") as [string, string | undefined];
  const parse = (s: string) => (s ? s.split(":") : []);
  let headParts = parse(head);
  let tailParts = tail === undefined ? [] : parse(tail);
  // Embedded IPv4 at the end (e.g. ::ffff:1.2.3.4)
  const last = (tail === undefined ? headParts : tailParts).at(-1);
  if (last?.includes(".")) {
    const n = v4ToInt(last);
    const extra = [((n >>> 16) & 0xffff).toString(16), (n & 0xffff).toString(16)];
    if (tail === undefined) headParts = [...headParts.slice(0, -1), ...extra];
    else tailParts = [...tailParts.slice(0, -1), ...extra];
  }
  const fill = tail === undefined ? 0 : 8 - headParts.length - tailParts.length;
  return [...headParts, ...Array(fill).fill("0"), ...tailParts].map((h) => Number.parseInt(h || "0", 16));
}

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return PRIVATE_V4.some((c) => inV4(ip, c)) || ip === "255.255.255.255";
  if (kind === 6) {
    const w = expandV6(ip);
    if (w.every((x) => x === 0)) return true; // ::
    if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
    if (((w[0] as number) & 0xfe00) === 0xfc00) return true; // fc00::/7
    if (((w[0] as number) & 0xffc0) === 0xfe80) return true; // fe80::/10
    if (((w[0] as number) & 0xff00) === 0xff00) return true; // multicast
    const mapped = w.slice(0, 5).every((x) => x === 0) && w[5] === 0xffff; // ::ffff:a.b.c.d
    const nat64 = w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0); // 64:ff9b::/96
    if (mapped || nat64) {
      const v4 = `${(w[6] as number) >> 8}.${(w[6] as number) & 0xff}.${(w[7] as number) >> 8}.${(w[7] as number) & 0xff}`;
      return isPrivateAddress(v4);
    }
    return false;
  }
  return true;
}

const SENSITIVE_HEADERS = ["authorization", "x-api-key", "api-key", "x-goog-api-key", "cookie"];

export function createSafeFetch(opts: SafeFetchOptions = {}): typeof fetch {
  const maxBytes = opts.maxBytes ?? 25 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  const resolve = opts.lookup ?? (async (host: string) => dnsLookup(host, { all: true, verbatim: true }));
  const transport = opts.transport ?? undiciFetch;
  const agents = new Map<string, Agent>();

  const pinnedAgent = (address: string, family: number) => {
    const key = `${address}/${family}`;
    let agent = agents.get(key);
    if (!agent) {
      agent = new Agent({
        connect: {
          lookup: (
            _host: string,
            options: { all?: boolean } | undefined,
            cb: (...args: unknown[]) => void,
          ) => {
            if (options?.all) cb(null, [{ address, family }]);
            else cb(null, address, family);
          },
        } as never,
      });
      agents.set(key, agent);
    }
    return agent;
  };

  async function validate(url: URL): Promise<{ address: string; family: number }> {
    if (url.protocol !== "https:" && !(url.protocol === "http:" && (opts.allowHttp || opts.allowPrivate))) {
      throw new BlockedUrlError(`only https URLs are allowed (got ${url.protocol})`);
    }
    if (url.username || url.password) throw new BlockedUrlError("URLs with credentials are not allowed");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const literal = isIP(host);
    const addresses = literal ? [{ address: host, family: literal }] : await resolve(host);
    if (addresses.length === 0) throw new BlockedUrlError(`could not resolve ${host}`);
    if (!opts.allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) {
      throw new BlockedUrlError(`${host} points to a private or internal address`);
    }
    return addresses[0] as { address: string; family: number };
  }

  const safeFetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    let url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    let method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    let body = init.body ?? null;
    const origin = url.origin;
    const signal = init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const pin = await validate(url);
      const res = (await transport(url, {
        method,
        headers,
        body: body as never,
        redirect: "manual",
        signal,
        dispatcher: opts.transport ? undefined : pinnedAgent(pin.address, pin.family),
      } as never)) as unknown as Response;
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location") as string, url);
        if (url.origin !== origin) {
          headers = new Headers(headers);
          for (const h of SENSITIVE_HEADERS) headers.delete(h);
        }
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = null;
        }
        continue;
      }
      const length = Number(res.headers.get("content-length") ?? "0");
      if (length > maxBytes) throw new BlockedUrlError(`response too large (${length} bytes)`);
      if (!res.body) return res;
      let seen = 0;
      const limited = res.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            seen += chunk.byteLength;
            if (seen > maxBytes) controller.error(new BlockedUrlError("response too large"));
            else controller.enqueue(chunk);
          },
        }),
      );
      return new Response(limited, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    throw new BlockedUrlError("too many redirects");
  };
  return safeFetch as typeof fetch;
}
