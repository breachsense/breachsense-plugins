import { describe, expect, it } from "vitest";
import { SEARCH_ENDPOINTS, byPath } from "../src/endpoints";

const build = (path: string, args: Record<string, unknown>) => byPath(path).build(args as never);

describe("endpoint request builders", () => {
  it("has 10 search endpoints with unique tool names", () => {
    expect(SEARCH_ENDPOINTS).toHaveLength(10);
    expect(new Set(SEARCH_ENDPOINTS.map((e) => e.tool)).size).toBe(10);
  });
  it("stealer: employees scope prefixes @, common params map", () => {
    expect(build("/stealer", { query: "acme.com", scope: "employees", since: "20260101", page: 2 }))
      .toEqual({ params: { s: "@acme.com", date: "20260101", p: "2" }, query: "acme.com" });
  });
  it("stealer: search by password or hardware id", () => {
    expect(build("/stealer", { query: "Summer2024", by: "password" })).toEqual({ params: { pwd: "Summer2024" }, query: "Summer2024" });
    expect(build("/stealer", { query: "ABC-123", by: "hwid" })).toEqual({ params: { hid: "ABC-123" }, query: "ABC-123" });
  });
  it("count_only becomes a bare count flag; page 1 is omitted", () => {
    expect(build("/combo", { query: "acme.com", count_only: true, page: 1 })).toEqual({ params: { s: "acme.com", count: true }, query: "acme.com" });
  });
  it("creds flags", () => {
    expect(build("/creds", { query: "acme.com", with_source: true, plaintext_only: true, count_unique_emails: true }))
      .toEqual({ params: { s: "acme.com", attr: true, uniq: true, count: "emails" }, query: "acme.com" });
  });
  it("nhi filters", () => {
    expect(build("/nhi", { query: "acme.com", platform: "AWS", category: "cloud_infra", hwid: "H1" }))
      .toEqual({ params: { s: "acme.com", platform: "AWS", category: "cloud_infra", hid: "H1" }, query: "acme.com" });
  });
  it("darkweb: domain or range, not both, not neither, max 31 days", () => {
    expect(build("/darkweb", { domain: "acme.com", with_descriptions: true }))
      .toEqual({ params: { s: "acme.com", desc: true, tadesc: true }, query: "acme.com" });
    expect(build("/darkweb", { date_range: { from: "20261001", to: "20261031" } }))
      .toEqual({ params: { range: "20261001-20261031" }, query: "20261001 to 20261031" });
    expect(build("/darkweb", {})).toEqual({ error: expect.stringMatching(/domain or a date_range/) });
    expect(build("/darkweb", { domain: "acme.com", date_range: { from: "20261001", to: "20261002" } })).toEqual({ error: expect.stringMatching(/not both/) });
    expect(build("/radar", { date_range: { from: "20261001", to: "20261201" } })).toEqual({ error: expect.stringMatching(/31 days/) });
  });
  it("docs: quotes multi-word phrases unless fuzzy", () => {
    expect(build("/docs", { query: "Bank Statement" })).toEqual({ params: { s: "\"Bank Statement\"" }, query: "Bank Statement" });
    expect(build("/docs", { query: "Bank Statement", fuzzy: true })).toEqual({ params: { s: "Bank Statement", fuzzy: "1" }, query: "Bank Statement" });
  });
  it("asm: only filter", () => {
    expect(build("/asm", { domain: "acme.com", only: "lookalikes" })).toEqual({ params: { s: "acme.com", pphish: true }, query: "acme.com" });
    expect(build("/asm", { domain: "acme.com", only: "assets" })).toEqual({ params: { s: "acme.com", assets: true }, query: "acme.com" });
  });
});

describe("flags", () => {
  const today = new Date("2026-11-24T00:00:00Z");
  it("stealer flags employee, role and short-password rows", () => {
    const f = byPath("/stealer").display.flags!;
    expect(f({ usr: "admin@acme.com", pwd: "abc" }, { query: "acme.com", today })).toEqual([
      "Employee account (username at the searched domain)", "Admin or role account", "Short password (under 8 characters)",
    ]);
  });
  it("phish flags OTP captures", () => {
    expect(byPath("/phish").display.flags!({ usr: "x@y.com", pwd: "longpassword", otp: "123456" }, { query: "acme.com", today }))
      .toContain("OTP captured with the credential (possible live login interception)");
  });
  it("sessions flags unexpired cookies only", () => {
    const f = byPath("/sessions").display.flags!;
    expect(f({ expires: "20270101" }, { query: "acme.com", today })).toEqual(["Unexpired session cookie (can bypass MFA)"]);
    expect(f({ expires: "20250101" }, { query: "acme.com", today })).toEqual([]);
  });
  it("nhi flags cloud and payment secrets; asm flags lookalikes", () => {
    expect(byPath("/nhi").display.flags!({ category: "payment" }, { query: "acme.com", today })).toEqual(["Cloud or payment secret"]);
    expect(byPath("/asm").display.flags!({ type: "pphish" }, { query: "acme.com", today })).toEqual(["Potential phishing or lookalike domain"]);
  });
});
