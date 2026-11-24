import { afterEach, describe, expect, it } from "vitest";
import { startFakeApi, type FakeApi, type FakeRequest, type FakeReply } from "./fake-api";
import { connect, testDeps, textOf } from "./helpers";

let api: FakeApi | null = null;
afterEach(async () => { await api?.close(); api = null; });

async function setup(handler: (r: FakeRequest) => FakeReply) {
  api = await startFakeApi(handler);
  return connect(testDeps(api.url));
}

describe("account tools", () => {
  it("annotations: reads are read-only, writes are destructive", async () => {
    const client = await setup(() => ({ json: {} }));
    const tools = (await client.listTools()).tools;
    const ann = (n: string) => tools.find((t) => t.name === n)!.annotations;
    expect(ann("get_usage")).toMatchObject({ readOnlyHint: true });
    expect(ann("get_monitoring_setup")).toMatchObject({ readOnlyHint: true });
    for (const n of ["manage_watchlist", "manage_alert_recipients", "manage_whitelist", "send_test_alert"]) {
      expect(ann(n)).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    expect(tools.find((t) => t.name.includes("rotate"))).toBeUndefined();
  });

  it("get_usage combines remaining quota and an audit summary", async () => {
    const client = await setup((r) => r.path === "/stealer"
      ? { json: { Remaining: 4321 } }
      : { json: { count: 3, events: [
          { time: "2026-11-20 10:00:00", endpoint: "/stealer", ip: "1.2.3.4", user_agent: "curl/8" },
          { time: "2026-11-20 11:00:00", endpoint: "/stealer", ip: "1.2.3.4", user_agent: "curl/8" },
          { time: "2026-11-21 09:00:00", endpoint: "/combo", ip: "5.6.7.8", user_agent: "breachsense-mcp/0.1.0" } ] } });
    const res = await client.callTool({ name: "get_usage", arguments: { days: 7 } });
    const text = textOf(res);
    expect(api!.calls.map((c) => `${c.path}?${c.query}`)).toEqual(["/stealer?r", "/account?action=audit&days=7"]);
    expect(text).toContain("Remaining this month: 4321 queries.");
    expect(text).toContain("3 counted requests");
    expect(text).toContain("/stealer: 2");
    expect(text).toContain("2026-11-20: 2");
  });

  it("get_monitoring_setup lists all four settings and redacts webhook credentials", async () => {
    const client = await setup((r) => r.query.includes("notify")
      ? { json: ["soc@acme.com", "https://bob:s3cret@hooks.acme.com/x"] }
      : r.query.includes("whitelist") ? { json: [] } : r.query.includes("tech") ? { json: ["it@acme.com"] } : { json: [{ ast: "acme.com", premium: false }] });
    const text = textOf(await client.callTool({ name: "get_monitoring_setup", arguments: {} }));
    expect(api!.calls.map((c) => c.query)).toEqual(["action=list", "action=list&notify", "action=list&tech", "action=list&whitelist"]);
    expect(text).toContain("acme.com");
    expect(text).toContain("https://[redacted]@hooks.acme.com/x");
    expect(text).not.toContain("s3cret");
  });

  it("manage_watchlist builds add with per-asset recipients and premium", async () => {
    const client = await setup(() => ({ json: { status: "success", message: "Asset added" } }));
    const res = await client.callTool({ name: "manage_watchlist", arguments: { action: "add", asset: "acme.com", recipients: ["soc@acme.com"], premium: true } });
    expect(api!.calls[0].query).toBe("action=add&ast=acme.com%3A%3Asoc%40acme.com&premium=1");
    expect(textOf(res)).toContain("Breachsense: Asset added");
  });

  it("manage_watchlist rejects bad recipients locally", async () => {
    const client = await setup(() => ({ json: {} }));
    const res = await client.callTool({ name: "manage_watchlist", arguments: { action: "add", asset: "acme.com", recipients: ["http://insecure.example"] } });
    expect(res.isError).toBe(true);
    expect(api!.calls).toHaveLength(0);
  });

  it("manage_alert_recipients never echoes webhook auth", async () => {
    const client = await setup(() => ({ json: { status: "success", message: "Saved creds=bob:s3cret" } }));
    const res = await client.callTool({ name: "manage_alert_recipients", arguments: { action: "add", type: "webhook_auth", value: "bob:s3cret" } });
    expect(api!.calls[0].query).toBe("action=add&creds=bob%3As3cret");
    expect(textOf(res)).not.toContain("s3cret");
    const rm = await client.callTool({ name: "manage_alert_recipients", arguments: { action: "remove", type: "webhook_auth", value: "bob:x" } });
    expect(rm.isError).toBe(true);
  });

  it("manage_whitelist and send_test_alert", async () => {
    const client = await setup((r) => r.query.startsWith("action=test")
      ? { json: { status: "success", message: "Test alert sent", remaining_today: 19, delivered: { webhooks_ok: 1, webhooks_failed: 0, emails_queued: 0 } } }
      : { json: { status: "success", message: "Whitelisted" } });
    await client.callTool({ name: "manage_whitelist", arguments: { action: "add", entry: "user@acme.com:OldPass123" } });
    expect(api!.calls[0].query).toBe("action=add&whitelist&ast=user%40acme.com%3AOldPass123");
    const t = textOf(await client.callTool({ name: "send_test_alert", arguments: { asset: "acme.com" } }));
    expect(api!.calls[1].query).toBe("action=test&ast=acme.com");
    expect(t).toContain("1 webhook delivered, 0 failed, 0 emails queued. Tests left today: 19.");
  });

  it("a write that times out says it may have been applied and is not retried", async () => {
    const client = await setup(() => ({ hang: true }));
    const res = await client.callTool({ name: "manage_watchlist", arguments: { action: "remove", asset: "acme.com" } });
    expect(api!.calls).toHaveLength(1);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/may already have been applied/);
  });

  it("send_test_alert on an unmonitored asset gets a specific message", async () => {
    const client = await setup(() => ({ status: 403, json: { error: "Unmonitored asset" } }));
    const res = await client.callTool({ name: "send_test_alert", arguments: { asset: "nope.com" } });
    expect(textOf(res)).toContain("That asset isn't on the watchlist.");
  });
});
