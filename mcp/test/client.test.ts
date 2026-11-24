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

describe("download redirect (S3) and body caps", () => {
  const download = { path: "/docs", params: { download_doc_id: "abc" }, op: "read" as const, billing: "billed" as const, followDownloadRedirect: true };
  const local = (u: URL) => u.hostname === "127.0.0.1";

  it("follows a 302 to allowlisted storage without the key; first leg is billed, second is free", async () => {
    const s3 = await startFakeApi(() => ({ body: "<html>original doc</html>", contentType: "text/html" }));
    try {
      const a = await serve([{ status: 302, headers: { location: `${s3.url}/bucket/abc?X-Amz-Signature=x` }, body: "" }]);
      const r = await client(a.url, { downloadHostAllowed: local }).c.request(download);
      expect(a.calls).toHaveLength(1);
      expect(s3.calls).toHaveLength(1);
      expect(s3.calls[0].path).toBe("/bucket/abc");
      expect(s3.calls[0].headers.lic).toBeUndefined();
      expect(s3.calls[0].headers["user-agent"]).toBe("breachsense-mcp/0.1.0");
      expect(JSON.stringify(s3.calls[0].headers)).not.toContain(KEY);
      expect(r).toMatchObject({ ok: true, status: 200, text: "<html>original doc</html>", contentType: "text/html", cost: { used: 1, unknown: 0 } });
    } finally { await s3.close(); }
  });

  it("default allowlist refuses a non-S3 location with no second request", async () => {
    const other = await startFakeApi(() => ({ body: "x", contentType: "text/plain" }));
    try {
      const a = await serve([{ status: 302, headers: { location: `${other.url}/x` }, body: "" }]);
      const r = await client(a.url).c.request(download);
      expect(other.calls).toHaveLength(0);
      expect(a.calls).toHaveLength(1);
      expect(r).toMatchObject({ ok: false, failure: { kind: "redirect_refused" }, cost: { used: 1, unknown: 0 }, mayHaveTakenEffect: false });
    } finally { await other.close(); }
  });

  it("default allowlist accepts only https *.amazonaws.com", async () => {
    const { downloadHostAllowedDefault: ok } = await import("../src/client");
    expect(ok(new URL("https://bucket.s3.us-east-1.amazonaws.com/a?sig"))).toBe(true);
    expect(ok(new URL("http://bucket.s3.amazonaws.com/a"))).toBe(false);
    expect(ok(new URL("https://amazonaws.com.evil.net/a"))).toBe(false);
    expect(ok(new URL("https://evilamazonaws.com/a"))).toBe(false);
  });

  it("default allowlist also accepts https *.linodeobjects.com, with the same suffix protections", async () => {
    const { downloadHostAllowedDefault: ok } = await import("../src/client");
    expect(ok(new URL("https://us-east-1.linodeobjects.com/bucket/key?X-Amz-Signature=x"))).toBe(true);
    expect(ok(new URL("https://bucket.us-east-1.linodeobjects.com/key"))).toBe(true);
    expect(ok(new URL("https://evil-linodeobjects.com/x"))).toBe(false);
    expect(ok(new URL("https://linodeobjects.com.evil.net/x"))).toBe(false);
    expect(ok(new URL("http://us-east-1.linodeobjects.com/x"))).toBe(false);
  });

  it("a storage error after the redirect is a failure that still counts the billed query", async () => {
    const s3 = await startFakeApi(() => ({ status: 403, body: "<Error>AccessDenied</Error>", contentType: "application/xml" }));
    try {
      const a = await serve([{ status: 302, headers: { location: `${s3.url}/b` }, body: "" }]);
      const r = await client(a.url, { downloadHostAllowed: local }).c.request(download);
      expect(r).toMatchObject({ ok: false, failure: { kind: "storage", status: 403 }, cost: { used: 1, unknown: 0 } });
    } finally { await s3.close(); }
  });

  it("other requests still never follow a redirect, even to allowlisted hosts", async () => {
    const target = await startFakeApi(() => ({ json: [] }));
    try {
      const a = await serve([{ status: 302, headers: { location: `${target.url}/x` }, body: "" }]);
      const r = await client(a.url, { downloadHostAllowed: local }).c.request(search);
      expect(target.calls).toHaveLength(0);
      expect(r).toMatchObject({ ok: false, failure: { kind: "http", status: 302 } });
    } finally { await target.close(); }
  });

  it("a 2xx body over the cap is a billed failure, not retried", async () => {
    const a = await serve([{ json: [{ usr: "x".repeat(200) }] }]);
    const r = await client(a.url, { maxBodyBytes: 100 }).c.request(search);
    expect(a.calls).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, failure: { kind: "too_large", limitBytes: 100 }, cost: { used: 1, unknown: 0 } });
  });

  it("downloads use their own cap, on the storage leg too", async () => {
    const s3 = await startFakeApi(() => ({ body: "y".repeat(300), contentType: "text/plain" }));
    try {
      const a = await serve([{ status: 302, headers: { location: `${s3.url}/b` }, body: "" }]);
      const big = await client(a.url, { downloadHostAllowed: local, maxBodyBytes: 100, maxDownloadBytes: 1000 }).c.request(download);
      expect(big).toMatchObject({ ok: true });
      const a2 = await serve([{ status: 302, headers: { location: `${s3.url}/b` }, body: "" }]);
      const r = await client(a2.url, { downloadHostAllowed: local, maxDownloadBytes: 200 }).c.request(download);
      expect(r).toMatchObject({ ok: false, failure: { kind: "too_large", limitBytes: 200 }, cost: { used: 1, unknown: 0 } });
    } finally { await s3.close(); }
  });
});

describe("uncounted request class (billing none)", () => {
  const acct = { path: "/account", params: { action: "list" }, op: "read" as const, billing: "none" as const };
  it("a non-2xx reply costs nothing", async () => {
    const a = await serve([{ status: 403, json: { error: "Unmonitored asset" } }]);
    const r = await client(a.url).c.request(acct);
    expect(r).toMatchObject({ ok: false, failure: { kind: "http", status: 403 }, cost: { used: 0, unknown: 0 } });
  });
  it("a timeout stays unknown", async () => {
    const a = await serve([{ hang: true }]);
    const r = await client(a.url).c.request(acct);
    expect(r).toMatchObject({ ok: false, failure: { kind: "no_response", reason: "timeout" } });
    expect(r.cost.unknown).toBeGreaterThan(0);
  });
  it("a search non-2xx stays unknown", async () => {
    const a = await serve([{ status: 403, json: { error: "x" } }]);
    const r = await client(a.url).c.request(search);
    expect(r.cost).toEqual({ used: 0, unknown: 1 });
  });
});
