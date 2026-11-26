import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { redact } from "./redact";
import { createDeps, createServer } from "./server";
import { VERSION } from "./version";

let secrets: string[] = process.env.BREACHSENSE_API_KEY ? [process.env.BREACHSENSE_API_KEY.trim()] : [];

async function main(): Promise<void> {
  const deps = createDeps(process.env, homedir());
  secrets = deps.secrets;
  const server = createServer(deps);
  await server.connect(new StdioServerTransport());
  // stderr only: stdout carries the MCP protocol. Never log the key or the key source contents.
  // Says WHERE the key came from (env var name or file path), never the key itself.
  console.error(deps.client
    ? `breachsense-mcp ${VERSION} ready (license key from ${deps.keySource})`
    : `breachsense-mcp ${VERSION} ready (no license key found; tools will explain how to add one)`);
}

main().catch((err) => {
  console.error(`breachsense-mcp failed to start: ${redact(err instanceof Error ? err.message : "unknown error", secrets)}`);
  process.exit(1);
});
