// Starts the built server over stdio with no key and checks the tool list and the setup message.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = { ...process.env, HOME: "/nonexistent" };
delete env.BREACHSENSE_API_KEY;
const transport = new StdioClientTransport({ command: "node", args: ["../plugins/breachsense/mcp/server.mjs"], env, stderr: "pipe" });
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
console.log(`${names.length} tools: ${names.join(", ")}`);
if (names.length !== 18) throw new Error(`expected 18 tools, got ${names.length}`);
const res = await client.callTool({ name: "search_stealer_logs", arguments: { query: "example.com" } });
if (!res.isError || !/No Breachsense license key found/.test(res.content[0].text)) throw new Error("setup message missing");
console.log("smoke OK");
await client.close();
