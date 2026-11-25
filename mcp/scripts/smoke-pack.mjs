// Packs the npm tarball, installs it into a fresh temp project, and starts the installed
// `breachsense-mcp` bin over stdio with no key: exact file list, SBOM, tool snapshot, setup message, no runtime deps.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { checkTools } from "./check-tools.mjs";

const work = mkdtempSync(join(process.env.SMOKE_TMPDIR || tmpdir(), "bs-mcp-pack-"));
const packOut = execFileSync("npm", ["pack", "--json", "--pack-destination", work], { encoding: "utf8" });
const [{ filename, files }] = JSON.parse(packOut);
const shipped = files.map((f) => f.path).sort();
console.log(`packed ${filename}: ${shipped.join(", ")}`);
const EXPECTED_FILES = ["LICENSE", "README.md", "dist/sbom.cdx.json", "dist/server.mjs", "package.json"];
if (shipped.join() !== EXPECTED_FILES.join()) {
  throw new Error(`tarball file list changed. Expected [${EXPECTED_FILES.join(", ")}], got [${shipped.join(", ")}]`);
}

const proj = join(work, "proj");
execFileSync("mkdir", ["-p", proj]);
writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "smoke", private: true }));
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", resolve(work, filename)], { cwd: proj, stdio: "inherit" });
const installed = readdirSync(join(proj, "node_modules")).filter((d) => !d.startsWith("."));
if (installed.join() !== "@breachsense") throw new Error(`expected only @breachsense in node_modules, got ${installed.join(", ")}`);
const bin = join(proj, "node_modules", ".bin", "breachsense-mcp");
const sbom = JSON.parse(readFileSync(join(proj, "node_modules", "@breachsense", "mcp", "dist", "sbom.cdx.json"), "utf8"));
const inSbom = sbom.components.map((c) => (c.group ? `${c.group}/${c.name}` : c.name));
for (const dep of ["@modelcontextprotocol/sdk", "zod"]) if (!inSbom.includes(dep)) throw new Error(`SBOM is missing ${dep}`);
if (sbom.bomFormat !== "CycloneDX" || sbom.components.some((c) => !c.version || !c.hashes)) throw new Error("SBOM is malformed");
if (!existsSync(bin)) throw new Error("breachsense-mcp bin not linked");

const env = { ...process.env, HOME: "/nonexistent" };
delete env.BREACHSENSE_API_KEY;
const transport = new StdioClientTransport({ command: bin, args: [], env, stderr: "pipe" });
const client = new Client({ name: "smoke-pack", version: "0" });
await client.connect(transport);
const { tools } = await client.listTools();
checkTools(tools);
const res = await client.callTool({ name: "search_stealer_logs", arguments: { query: "example.com" } });
if (!res.isError || !/No Breachsense license key found/.test(res.content[0].text)) throw new Error("setup message missing");
const info = client.getServerVersion();
console.log(`installed bin OK: ${info.name} ${info.version}, ${tools.length} tools match the snapshot, SBOM lists ${sbom.components.length} bundled packages, no runtime deps`);
await client.close();
