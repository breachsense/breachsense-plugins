import { afterEach, describe, expect, it } from "vitest";
import { BreachsenseClient, buildUrl, isFreeTerm, type ClientOptions } from "../src/client";
import { startFakeApi, type FakeApi, type FakeReply } from "./fake-api";

const KEY = "testkey_0123456789abcdef";
let api: FakeApi | null = null;
afterEach(async () => { await api?.close(); api = null; });

function client(url: string, extra: Partial<ClientOptions> = {}) {
  const slept: number[] = [];
  const c = new BreachsenseClient({ key: KEY, baseUrl: url, throttleMs: 0, timeoutMs: 200, sleep: async (ms) => { slept.push(ms); }, ...extra });
  return { c, slept };
}
async function serve(replies: FakeReply[]) {
  await api?.close();
  let i = 0;
  api = await startFakeApi(() => replies[Math.min(i++, replies.length - 1)]);
  return api;
}
const search = { path: "/stealer", params: { s: "acme.com" }, op: "read" as const, billing: "billed" as const };
const write = { path: "/account", params: { action: "add", ast: "acme.com" }, op: "write" as const, billing: "unknown" as const };

describe("buildUrl / isFreeTerm", () => {
  it("encodes values, supports bare flags, never splices raw input", () => {
    expect(buildUrl("https://h/", "/creds", { s: "acme.com&p=2", attr: true, count: "emails" }))
      .toBe("https://h/creds?s=acme.com%26p%3D2&attr&count=emails");
  });
  it("detects free test terms", () => {
    expect(isFreeTerm({ s: "ignore@example.com" })).toBe(true);
    expect(isFreeTerm({ s: "@test.com" })).toBe(true);
    expect(isFreeTerm({ s: "notexample.com" })).toBe(false);
    expect(isFreeTerm({ pwd: "x" })).toBe(false);
  });
});

describe("BreachsenseClient", () => {
  it("sends the key in the lic header with our User-Agent, never in the URL", async () => {
    const a = await serve([{ json: [] }]);
    await client(a.url).c.request(search);
    expect(a.calls[0].headers.lic).toBe(KEY);
    expect(a.calls[0].headers["user-agent"]).toBe("breachsense-mcp/0.1.0");
    expect(a.calls[0].query).not.toContain(KEY);
  });
  it("200 is a complete, billed success", async () => {
    const a = await serve([{ json: [{ usr: "a" }] }]);
    const r = await client(a.url).c.request(search);
    expect(r).toMatchObject({ ok: true, status: 200, partial: false, json: [{ usr: "a" }], cost: { used: 1, unknown: 0 } });
  });
  it("206 is a partial success", async () => {
    const a = await serve([{ status: 206, json: [] }]);
    expect(await client(a.url).c.request(search)).toMatchObject({ ok: true, partial: true });
  });
  it("test domains cost nothing", async () => {
    const a = await serve([{ json: [] }]);
    const r = await client(a.url).c.request({ ...search, params: { s: "example.com" } });
    expect(r.cost).toEqual({ used: 0, unknown: 0 });
  });
  it("read: 5xx is retried once", async () => {
    const a = await serve([{ status: 500, json: {} }, { json: [] }]);
    const r = await client(a.url).c.request(search);
    expect(a.calls).toHaveLength(2);
    expect(r).toMatchObject({ ok: true, cost: { used: 1, unknown: 1 } });
  });
  it("write: 5xx is not retried and may have taken effect", async () => {
    const a = await serve([{ status: 502, body: "bad gateway", contentType: "text/plain" }]);
    const r = await client(a.url).c.request(write);
    expect(a.calls).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, mayHaveTakenEffect: true });
  });
  it("read: timeout after dispatch is retried once and the cost is unknown", async () => {
    const a = await serve([{ hang: true }]);
    const r = await client(a.url).c.request(search);
    expect(a.calls).toHaveLength(2);
    expect(r).toMatchObject({ ok: false, failure: { kind: "no_response", reason: "timeout" }, cost: { used: 0, unknown: 2 }, mayHaveTakenEffect: false });
  });
  it("write: timeout after dispatch stops immediately", async () => {
    const a = await serve([{ hang: true }]);
    const r = await client(a.url).c.request(write);
    expect(a.calls).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, mayHaveTakenEffect: true, cost: { unknown: 1 } });
  });
  it("connection dropped after dispatch is a reset with unknown cost", async () => {
    const a = await serve([{ destroy: true }]);
    const r = await client(a.url).c.request(write);
    expect(r).toMatchObject({ ok: false, failure: { kind: "no_response", reason: "reset" }, cost: { unknown: 1 } });
  });
  it("never sent (connection refused) is retried once, even for writes, and costs nothing", async () => {
    // Port 1 is on fetch's blocked-port list ("bad port", no error code), so use a port that was just freed.
    const probe = await startFakeApi(() => ({}));
    const refused = probe.url;
    await probe.close();
    let calls = 0;
    const fetchImpl: typeof fetch = (...args) => { calls++; return fetch(...args); };
    const r = await client(refused, { fetchImpl }).c.request(write);
    expect(calls).toBe(2);
    expect(r).toMatchObject({ ok: false, failure: { kind: "not_sent", code: "ECONNREFUSED" }, cost: { used: 0, unknown: 0 }, mayHaveTakenEffect: false });
  });
  it("429 honours Retry-After inside the deadline", async () => {
    const a = await serve([{ status: 429, json: { error: true, message: "Rate limit exceeded." }, headers: { "retry-after": "2" } }, { json: [] }]);
    const { c, slept } = client(a.url);
    expect(await c.request(search)).toMatchObject({ ok: true });
    expect(slept).toEqual([2000]);
  });
  it("429 whose wait passes the deadline returns the retry time", async () => {
    const a = await serve([{ status: 429, json: { message: "Rate limit exceeded." }, headers: { "retry-after": "30" } }]);
    const { c, slept } = client(a.url);
    const r = await c.request(search);
    expect(a.calls).toHaveLength(1);
    expect(slept).toEqual([]);
    expect(r).toMatchObject({ ok: false, failure: { kind: "http", status: 429 } });
    expect((r as { retryAt: Date }).retryAt).toBeInstanceOf(Date);
  });
  it("429 without Retry-After backs off 1s, 2s, 4s then gives up", async () => {
    const a = await serve([{ status: 429, json: { message: "Rate limit exceeded." } }]);
    const { c, slept } = client(a.url);
    const r = await c.request(search);
    expect(slept).toEqual([1000, 2000, 4000]);
    expect(a.calls).toHaveLength(4);
    expect(r.ok).toBe(false);
  });
  it("daily-limit 429 returns immediately", async () => {
    const a = await serve([{ status: 429, json: { error: "Daily test limit reached", reset_in_hours: 5 } }]);
    const { c, slept } = client(a.url);
    const r = await c.request(write);
    expect(a.calls).toHaveLength(1);
    expect(slept).toEqual([]);
    expect(r).toMatchObject({ ok: false, mayHaveTakenEffect: false });
  });
  it("HTML responses are failures, not retried", async () => {
    const a = await serve([{ status: 404, body: "<html>nope</html>", contentType: "text/html" }]);
    const r = await client(a.url).c.request(search);
    expect(a.calls).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, failure: { kind: "http", status: 404, html: true } });
  });
  it("redirects are never followed: key stays put, result is a failure", async () => {
    const target = await startFakeApi(() => ({ json: [] }));
    try {
      const a = await serve([{ status: 302, headers: { location: `${target.url}/stealer` }, body: "" }]);
      const r = await client(a.url).c.request(write);
      expect(target.calls).toHaveLength(0);
      expect(a.calls).toHaveLength(1);
      expect(r).toMatchObject({ ok: false, failure: { kind: "http", status: 302 }, mayHaveTakenEffect: true, cost: { used: 0, unknown: 1 } });
    } finally { await target.close(); }
  });
  it("HTML on a 200 is a failure, not a billed success", async () => {
    const a = await serve([{ status: 200, body: "<html>portal</html>", contentType: "text/html" }]);
    const r = await client(a.url).c.request(search);
    expect(a.calls).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, failure: { kind: "http", status: 200, html: true }, cost: { used: 0, unknown: 1 }, mayHaveTakenEffect: false });
    const w = await client(a.url).c.request(write);
    expect(w).toMatchObject({ ok: false, mayHaveTakenEffect: true });
  });
  it("a pre-send TypeError (blocked port) is not_sent INVALID_REQUEST and not retried", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = (...args) => { calls++; return fetch(...args); };
    const r = await client("http://127.0.0.1:1", { fetchImpl }).c.request(write);
    expect(calls).toBe(1);
    expect(r).toMatchObject({ ok: false, failure: { kind: "not_sent", code: "INVALID_REQUEST" }, cost: { used: 0, unknown: 0 }, mayHaveTakenEffect: false });
  });
  it("write: a non-daily 429 is retried and did not take effect", async () => {
    const a = await serve([{ status: 429, json: { message: "Rate limit exceeded." } }, { json: {} }]);
    const { c, slept } = client(a.url);
    expect(await c.request(write)).toMatchObject({ ok: true });
    expect(a.calls).toHaveLength(2);
    expect(slept).toEqual([1000]);
    const b = await serve([{ status: 429, json: { message: "Rate limit exceeded." } }]);
    expect(await client(b.url).c.request(write)).toMatchObject({ ok: false, mayHaveTakenEffect: false });
  });
  it("read: a destroyed connection is retried once", async () => {
    const a = await serve([{ destroy: true }]);
    const r = await client(a.url).c.request(search);
    expect(a.calls).toHaveLength(2);
    expect(r).toMatchObject({ ok: false, failure: { kind: "no_response", reason: "reset" }, cost: { unknown: 2 } });
  });
});
