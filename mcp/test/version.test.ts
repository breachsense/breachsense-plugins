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

  // npm trusted publishing validates these at publish time, not when the config is saved. A mismatch
  // surfaces only on the tag push, as a confusing ENEEDAUTH, so check them on every PR instead.
  describe("trusted publishing prerequisites", () => {
    const workflow = readFileSync(new URL("../../.github/workflows/mcp.yml", import.meta.url), "utf8");
    const release = workflow.slice(workflow.indexOf("\n  release:"));

    it("repository.url points exactly at breachsense/breachsense-plugins", () => {
      expect(pkg.repository.url).toBe("git+https://github.com/breachsense/breachsense-plugins.git");
      expect(pkg.repository.directory).toBe("mcp");
    });

    it("the release job exists in .github/workflows/mcp.yml (the filename npm is configured with)", () => {
      expect(release).toContain("startsWith(github.ref, 'refs/tags/mcp-v')");
      expect(release).toMatch(/npm stage publish/);
    });

    it("the release job runs on a GitHub-hosted runner with id-token: write", () => {
      expect(release).toMatch(/runs-on: ubuntu-latest/);
      expect(release).not.toMatch(/self-hosted/);
      expect(release).toMatch(/id-token: write/);
    });

    it("the release job never authenticates with a token", () => {
      expect(workflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
    });
  });
});
