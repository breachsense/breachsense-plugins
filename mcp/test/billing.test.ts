import { expect, it } from "vitest";
import { BILLING, searchBilling } from "../src/billing";

it("remaining and account requests are verified uncounted", () => {
  expect(BILLING.remaining).toBe("none");
  expect(BILLING.account).toBe("none");
  expect(BILLING.search).toBe("billed");
  expect(BILLING.download).toBe("billed");
});

it("count_only is free on every search endpoint", () => {
  for (const path of ["/stealer", "/combo", "/creds", "/sessions", "/nhi", "/phish", "/darkweb", "/radar", "/asm", "/docs"]) {
    expect(searchBilling(path, { s: "acme.com", count: true })).toBe("none");
  }
  expect(searchBilling("/creds", { s: "acme.com", count: "emails" })).toBe("none");
});

it("row searches are billed on every endpoint", () => {
  for (const path of ["/stealer", "/creds", "/docs", "/asm"]) {
    expect(searchBilling(path, { s: "acme.com" })).toBe("billed");
  }
});
