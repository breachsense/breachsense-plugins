import { afterEach, describe, expect, it } from "vitest";
import { startFakeApi, type FakeApi, type FakeReply } from "./fake-api";
import { connect, testDeps, textOf } from "./helpers";

let api: FakeApi | null = null;
afterEach(async () => { await api?.close(); api = null; });

async function run(replies: Record<string, FakeReply>, args: Record<string, unknown> = { domain: "acme.com" }) {
  api = await startFakeApi((req) => replies[req.path] ?? { json: [] });
  const client = await connect(testDeps(api.url));
  return client.callTool({ name: "check_credential_exposure", arguments: args });
}

describe("check_credential_exposure", () => {
  it("is annotated read-only and says it costs 4 queries", async () => {
    api = await startFakeApi(() => ({ json: [] }));
    const client = await connect(testDeps(api.url));
    const t = (await client.listTools()).tools.find((x) => x.name === "check_credential_exposure")!;
    expect(t.annotations).toMatchObject({ readOnlyHint: true });
    expect(t.description).toMatch(/4 queries/);
  });

  it("ACCEPTANCE: three empty sources and one timeout after dispatch", async () => {
    const res = await run({ "/phish": { hang: true } });
    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(text).toContain("No matches in the three sources checked. The fourth source (phishing captures) timed out. Its query usage is unknown.");
    // The timed-out source was tried twice (read retry policy), so both attempts are unknown.
    expect(text).toContain("Cost: 3 queries used, 2 unknown.");
    expect(res.structuredContent).toMatchObject({
      sources: [
        { source: "stealer logs", status: "completed", rows: 0 },
        { source: "combo lists", status: "completed", rows: 0 },
        { source: "breach credentials", status: "completed", rows: 0 },
        { source: "phishing captures", status: "failed", reason: "timed out" },
      ],
      cost: { used: 3, unknown: 2 },
    });
  });

  it("never re-requests sources that already succeeded", async () => {
    await run({ "/phish": { hang: true } });
    const paths = api!.calls.map((c) => c.path);
    expect(paths.filter((p) => p === "/stealer")).toHaveLength(1);
    expect(paths.filter((p) => p === "/phish")).toHaveLength(2);
  });

  it("all four failing is an error", async () => {
    const down = { status: 503, json: {} };
    const res = await run({ "/stealer": down, "/combo": down, "/creds": down, "/phish": down });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/None of the four sources could be checked/);
  });

  it("merges hits with per-source counts, flags and scope", async () => {
    const res = await run({
      "/stealer": { status: 206, json: [{ usr: "admin@acme.com", pwd: "pw", src: "https://acme.com", fnd: "20261120" }] },
      "/phish": { json: [{ usr: "bob@acme.com", pwd: "longpassword", otp: "123456", fnd: "20261101" }] },
    }, { domain: "acme.com", scope: "employees", since: "20260101" });
    const text = textOf(res);
    expect(text).toContain("stealer logs: 1 row (partial, more pages exist)");
    expect(text).toContain("combo lists: no matches");
    expect(text).toContain("OTP captured with the credential");
    expect(text).toContain("Cost: 4 queries used.");
    const q = Object.fromEntries(api!.calls.map((c) => [c.path, c.query]));
    expect(q["/stealer"]).toBe("s=%40acme.com&date=20260101");
    expect(q["/combo"]).toBe("s=acme.com&date=20260101");
    expect(q["/phish"]).toBe("s=%40acme.com&date=20260101");
  });

  it("each structured source carries its own cost", async () => {
    const res = await run({ "/phish": { hang: true } });
    const sources = (res.structuredContent as { sources: { cost: unknown }[] }).sources;
    expect(sources.map((x) => x.cost)).toEqual([
      { used: 1, unknown: 0 }, { used: 1, unknown: 0 }, { used: 1, unknown: 0 }, { used: 0, unknown: 2 },
    ]);
  });

  it("an unrecognised reply is a failed source, not zero matches", async () => {
    const res = await run({ "/combo": { json: { weird: true } }, "/creds": { body: "not json", contentType: "text/plain" } });
    const text = textOf(res);
    expect(text).toContain("The second source (combo lists) returned an unexpected response.");
    expect(text).toContain("The third source (breach credentials) returned an unexpected response.");
    expect(text).toContain("No matches in the two sources checked.");
    expect(text).toContain("Cost: 4 queries used.");
    expect(res.structuredContent).toMatchObject({ sources: [
      { status: "completed" }, { source: "combo lists", status: "failed", cost: { used: 1, unknown: 0 } },
      { source: "breach credentials", status: "failed" }, { status: "completed" },
    ] });
  });

  it("failure lines never end in a double period", async () => {
    const res = await run({ "/combo": { status: 403, json: { message: "Your plan does not include /combo." } } });
    const text = textOf(res);
    expect(text).toContain("The second source (combo lists) returned an error: This feature isn't included in the license's plan. Contact support@breachsense.com to add it.");
    expect(text).not.toContain("..");
  });
});
