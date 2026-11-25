// Compares the tool names a running server lists with the snapshot in expected-tools.json.
// A rename or a silent removal fails with the exact names; an intentional change updates the snapshot.
import { readFileSync } from "node:fs";

export function checkTools(tools) {
  const expected = JSON.parse(readFileSync(new URL("./expected-tools.json", import.meta.url), "utf8"));
  const got = tools.map((t) => t.name).sort();
  const missing = expected.filter((n) => !got.includes(n));
  const extra = got.filter((n) => !expected.includes(n));
  if (missing.length || extra.length) {
    throw new Error(`tool list differs from scripts/expected-tools.json. Missing: [${missing.join(", ")}]. Not in snapshot: [${extra.join(", ")}]. ` +
      "If the change is intentional, update the snapshot in the same PR.");
  }
  return got;
}
