import { describe, expect, it } from "vitest";
import type { Fail, Failure } from "../src/client";
import { describeFailure, shortFailure } from "../src/errors";

const ctx = { keySource: "the BREACHSENSE_API_KEY environment variable", secrets: ["testkey_0123456789abcdef"] };
const http = (status: number, json: unknown, text = JSON.stringify(json), html = false): Failure =>
  ({ kind: "http", status, json, text, html, retryAfterMs: null });
const fail = (failure: Failure, extra: Partial<Fail> = {}): Fail =>
  ({ ok: false, failure, cost: { used: 0, unknown: 1 }, mayHaveTakenEffect: false, retryAt: null, ...extra });

describe("describeFailure", () => {
  it("invalid key names the source, never the key", () => {
    const m = describeFailure(fail(http(401, { error: "Please use a valid license." })), ctx);
    expect(m).toContain("BREACHSENSE_API_KEY environment variable");
    expect(m).not.toContain("testkey");
  });
  it("monthly limit shows numbers only when present", () => {
    expect(describeFailure(fail(http(403, { message: "Monthly query limit reached. Contact support", limit: 1000, used: 1000 })), ctx))
      .toBe("This license has reached its monthly query limit (1000 of 1000 used). Contact support@breachsense.com to raise it.");
    expect(describeFailure(fail(http(403, { message: "Monthly query limit reached." })), ctx))
      .toBe("This license has reached its monthly query limit. Contact support@breachsense.com to raise it.");
  });
  it("plan restriction and unmonitored asset", () => {
    expect(describeFailure(fail(http(403, { error: "Your plan does not include /nhi." })), ctx)).toMatch(/isn't included in the license's plan/);
    expect(describeFailure(fail(http(403, { error: "Unmonitored asset" })), ctx)).toMatch(/isn't on the watchlist/);
  });
  it("edge block 1010 and unexpected HTML do not guess a cause", () => {
    expect(describeFailure(fail(http(403, undefined, "error code: 1010")), ctx)).toBe("Breachsense blocked this request at its edge.");
    expect(describeFailure(fail(http(404, undefined, "<html></html>", true)), ctx)).toBe("Breachsense returned an unexpected response (HTTP 404).");
  });
  it("daily limit and rate limit", () => {
    expect(describeFailure(fail(http(429, { error: "Daily test limit", reset_in_hours: 5 })), ctx)).toBe("The daily limit for this action has been reached. It resets in 5 hours.");
    expect(describeFailure(fail(http(429, { message: "Rate limit exceeded." }), { retryAt: new Date("2026-11-24T10:00:00Z") }), ctx))
      .toBe("Breachsense is rate limiting requests. Try again after 2026-11-24T10:00:00.000Z.");
  });
  it("400 and 422 pass a cleaned provider message", () => {
    expect(describeFailure(fail(http(400, { message: "range too long\u0000 testkey_0123456789abcdef" })), ctx))
      .toBe("Breachsense rejected the request: range too long  [redacted]");
  });
  it("write timeouts and 5xx warn the change may have been applied", () => {
    const t = describeFailure(fail({ kind: "no_response", reason: "timeout" }, { mayHaveTakenEffect: true }), ctx);
    expect(t).toMatch(/didn't respond in time/);
    expect(t).toMatch(/may already have been applied.*get_monitoring_setup/);
    expect(describeFailure(fail(http(500, {})), ctx)).not.toMatch(/applied/);
  });
  it("never-sent failures name the network problem", () => {
    expect(describeFailure(fail({ kind: "not_sent", code: "ENOTFOUND" }), ctx)).toMatch(/Couldn't reach api\.breachsense\.com \(ENOTFOUND\)/);
  });
  it("invalid request says the request was built wrong and nothing was sent", () => {
    expect(describeFailure(fail({ kind: "not_sent", code: "INVALID_REQUEST" }), ctx))
      .toBe("The request could not be built (invalid API base URL, port or license key format), so nothing was sent. Check BREACHSENSE_API_BASE and the license key.");
  });
  it("short form for fan-out lines", () => {
    expect(shortFailure(fail({ kind: "no_response", reason: "timeout" }), ctx)).toBe("timed out");
    expect(shortFailure(fail({ kind: "not_sent", code: "ENOTFOUND" }), ctx)).toBe("couldn't be reached");
  });
  it("short form for an invalid request", () => {
    expect(shortFailure(fail({ kind: "not_sent", code: "INVALID_REQUEST" }), ctx)).toBe("could not be sent (invalid request)");
  });
});
