import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SETUP_MESSAGE } from "../src/config";
import { VERSION } from "../src/version";

describe("package metadata", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  it("VERSION matches package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  it("ships only the self-contained bundle (no runtime dependencies)", () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.bin["breachsense-mcp"]).toBe("dist/server.mjs");
    expect(pkg.files).toContain("dist/server.mjs");
  });

  it("setup message does not assume one AI tool", () => {
    expect(SETUP_MESSAGE).not.toMatch(/Claude/);
    expect(SETUP_MESSAGE).toMatch(/BREACHSENSE_API_KEY/);
    expect(SETUP_MESSAGE).toMatch(/~\/\.config\/breachsense\/license\.md/);
  });
});
