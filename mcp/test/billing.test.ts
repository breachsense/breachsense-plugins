import { expect, it } from "vitest";
import { BILLING } from "../src/billing";

it("remaining and account requests are verified uncounted", () => {
  expect(BILLING.remaining).toBe("none");
  expect(BILLING.account).toBe("none");
  expect(BILLING.search).toBe("billed");
  expect(BILLING.download).toBe("billed");
});
