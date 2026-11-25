// Packs the npm tarball, installs it into a fresh temp project, and starts the installed
// `breachsense-mcp` bin over stdio with no key: 18 tools, setup message, no runtime deps.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const work = mkdtempSync(join(process.env.SMOKE_TMPDIR || tmpdir(), "bs-mcp-pack-"));
const packOut = execFileSync("npm", ["pack", "--json", "--pack-destination", work], { encoding: "utf8" });
const [{ filename, files }] = JSON.parse(packOut);
const shipped = files.map((f) => f.path).sort();
console.log(`packed ${filename}: ${shipped.join(", ")}`);
for (const f of ["dist/server.mjs", "package.json", "README.md", "LICENSE"]) {
  if (!shipped.includes(f)) throw new Error(`tarball is missing ${f}`);
}
if (shipped.some((f) => f.startsWith("src/") || f.startsWith("test/"))) throw new Error("tarball ships source or tests");

const proj = join(work, "proj");
execFileSync("mkdir", ["-p", proj]);
writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "smoke", private: true }));
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", resolve(work, filename)], { cwd: proj, stdio: "inherit" });
const installed = readdirSync(join(proj, "node_modules")).filter((d) => !d.startsWith("."));
if (installed.join() !== "@breachsense") throw new Error(`expected only @breachsense in node_modules, got ${installed.join(", ")}`);
const bin = join(proj, "node_modules", ".bin", "breachsense-mcp");
if (!existsSync(bin)) throw new Error("breachsense-mcp bin not linked");

const env = { ...process.env, HOME: "/nonexistent" };
delete env.BREACHSENSE_API_KEY;
const transport = new StdioClientTransport({ command: bin, args: [], env, stderr: "pipe" });
const client = new Client({ name: "smoke-pack", version: "0" });
await client.connect(transport);
const { tools } = await client.listTools();
if (tools.length !== 18) throw new Error(`expected 18 tools, got ${tools.length}`);
const res = await client.callTool({ name: "search_stealer_logs", arguments: { query: "example.com" } });
if (!res.isError || !/No Breachsense license key found/.test(res.content[0].text)) throw new Error("setup message missing");
const info = client.getServerVersion();
console.log(`installed bin OK: ${info.name} ${info.version}, ${tools.length} tools, no runtime deps`);
await client.close();
