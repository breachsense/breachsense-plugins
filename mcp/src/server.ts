import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BreachsenseClient } from "./client";
import { loadLicense, resolveBaseUrl } from "./config";
import { CostTracker } from "./cost";
import { INSTRUCTIONS } from "./instructions";
import { ResultStore } from "./results";
import { registerAccountTools } from "./tools/account";
import type { Deps } from "./tools/common";
import { registerExposureTool } from "./tools/exposure";
import { registerDownloadTool, registerSearchTools } from "./tools/search";
import { VERSION } from "./version";

export function createDeps(env: NodeJS.ProcessEnv, home: string): Deps {
  const base = { store: new ResultStore(), costs: new CostTracker(), today: () => new Date() };
  const license = loadLicense(env, home);
  if (!license) return { ...base, client: null, keySource: "", secrets: [] };
  const client = new BreachsenseClient({ key: license.key, baseUrl: resolveBaseUrl(env) });
  return { ...base, client, keySource: license.source, secrets: [license.key] };
}

export function createServer(deps: Deps): McpServer {
  const server = new McpServer({ name: "breachsense", version: VERSION }, { instructions: INSTRUCTIONS });
  registerSearchTools(server, deps);
  registerDownloadTool(server, deps);
  registerExposureTool(server, deps);
  registerAccountTools(server, deps);

  server.registerResource(
    "results",
    new ResourceTemplate("breachsense://results/{id}", { list: undefined }),
    { title: "Full Breachsense result", description: "A full result page from an earlier tool call in this session. Reading it costs no queries.", mimeType: "application/json" },
    async (uri, { id }) => {
      const item = deps.store.get(String(id));
      if (!item) throw new Error("Result not found. Results are kept in memory for this session only.");
      return { contents: [item.blob !== undefined
        ? { uri: uri.href, mimeType: item.mimeType, blob: item.blob }
        : { uri: uri.href, mimeType: item.mimeType, text: item.text ?? "" }] };
    },
  );
  return server;
}
