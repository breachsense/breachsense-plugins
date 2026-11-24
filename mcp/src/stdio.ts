import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDeps, createServer } from "./server";

async function main(): Promise<void> {
  const deps = createDeps(process.env, homedir());
  const server = createServer(deps);
  await server.connect(new StdioServerTransport());
  // stderr only: stdout carries the MCP protocol. Never log the key or the key source contents.
  console.error(deps.client ? "breachsense-mcp ready" : "breachsense-mcp ready (no license key found; tools will explain how to add one)");
}

main().catch((err) => {
  console.error(`breachsense-mcp failed to start: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exit(1);
});
