import { expect, it } from "vitest";
import { CostTracker, costLine, costPhrase, sumCosts } from "../src/cost";

it("phrases costs", () => {
  expect(costPhrase({ used: 1, unknown: 0 })).toBe("1 query used");
  expect(costPhrase({ used: 3, unknown: 1 })).toBe("3 queries used, 1 unknown");
  expect(costPhrase({ used: 0, unknown: 0 })).toBe("0 queries used");
});
it("tracks a session total and builds the cost line", () => {
  const t = new CostTracker();
  t.add({ used: 2, unknown: 0 });
  t.add({ used: 1, unknown: 1 });
  expect(t.total()).toEqual({ used: 3, unknown: 1 });
  expect(sumCosts({ used: 1, unknown: 0 }, { used: 0, unknown: 2 })).toEqual({ used: 1, unknown: 2 });
  const line = costLine({ used: 1, unknown: 1 }, t.total());
  expect(line).toMatch(/^Cost: 1 query used, 1 unknown\. Session total: 3 queries used, 1 unknown\./);
  expect(line).toMatch(/get_usage/);
  expect(costLine({ used: 1, unknown: 0 }, { used: 1, unknown: 0 })).toBe("Cost: 1 query used. Session total: 1 query used.");
});
