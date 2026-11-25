import { expect, it } from "vitest";
import { ResultStore } from "../src/results";

it("stores results under sequential URIs and evicts the oldest past the cap", () => {
  const s = new ResultStore(2);
  const a = s.put({ mimeType: "application/json", text: "1" });
  const b = s.put({ mimeType: "application/json", text: "2" });
  const c = s.put({ mimeType: "application/json", text: "3" });
  expect([a, b, c]).toEqual(["breachsense://results/1", "breachsense://results/2", "breachsense://results/3"]);
  expect(s.get("1")).toBeUndefined();
  expect(s.get("3")?.text).toBe("3");
});
