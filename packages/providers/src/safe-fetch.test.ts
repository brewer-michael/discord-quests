import { describe, expect, it } from "vitest";
import { BlockedUrlError, createSafeFetch, isPrivateAddress } from "./safe-fetch";

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.20.0.1", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["::1", true],
    ["::", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:7f00:1", true],
    ["64:ff9b::a9fe:a9fe", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["2606:4700:4700::1111", false],
    ["::ffff:8.8.8.8", false],
  ])("%s private=%s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe("safe fetch", () => {
  const lookup = (map: Record<string, string>) => async (host: string) => {
    const address = map[host];
    if (!address) throw new Error("ENOTFOUND");
    return [{ address, family: address.includes(":") ? 6 : 4 }];
  };
  const ok = () => new Response("hello", { status: 200 });

  it("blocks private, loopback and metadata addresses", async () => {
    const f = createSafeFetch({
      lookup: lookup({ "evil.example": "169.254.169.254", "lan.example": "192.168.0.5" }),
      transport: ok as never,
    });
    await expect(f("https://evil.example/x")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(f("https://lan.example/x")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(f("https://127.0.0.1/x")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(f("https://[::1]/x")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("allows public hosts and only https by default", async () => {
    const f = createSafeFetch({ lookup: lookup({ "api.example": "93.184.216.34" }), transport: ok as never });
    expect(await (await f("https://api.example/x")).text()).toBe("hello");
    await expect(f("http://api.example/x")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(f("https://user:pw@api.example/x")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("lets self-hosters reach private networks when allowed", async () => {
    const f = createSafeFetch({ allowPrivate: true, lookup: lookup({}), transport: ok as never });
    expect((await f("http://127.0.0.1:11434/v1/models")).status).toBe(200);
  });

  it("re-checks redirects and drops credentials across origins", async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const transport = (async (url: URL, init: { headers: Headers }) => {
      seen.push({ url: url.toString(), auth: init.headers.get("authorization") });
      if (url.hostname === "a.example")
        return new Response(null, { status: 302, headers: { location: "https://b.example/next" } });
      if (url.hostname === "b.example")
        return new Response(null, { status: 302, headers: { location: "https://internal.example/" } });
      return ok();
    }) as never;
    const f = createSafeFetch({
      lookup: lookup({
        "a.example": "93.184.216.34",
        "b.example": "93.184.216.35",
        "internal.example": "10.0.0.1",
      }),
      transport,
    });
    await expect(
      f("https://a.example/start", { headers: { authorization: "Bearer secret" } }),
    ).rejects.toBeInstanceOf(BlockedUrlError);
    expect(seen[0]?.auth).toBe("Bearer secret");
    expect(seen[1]?.auth).toBeNull();
  });

  it("caps response size", async () => {
    const big = () => new Response("x".repeat(5000), { status: 200 });
    const f = createSafeFetch({
      maxBytes: 1000,
      lookup: lookup({ "api.example": "93.184.216.34" }),
      transport: big as never,
    });
    const res = await f("https://api.example/x");
    await expect(res.text()).rejects.toThrow();
  });
});
