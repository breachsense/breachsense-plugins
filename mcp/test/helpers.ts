import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BreachsenseClient, type ClientOptions } from "../src/client";
import { CostTracker } from "../src/cost";
import { ResultStore } from "../src/results";
import { createServer } from "../src/server";
import type { Deps } from "../src/tools/common";

export const TEST_KEY = "testkey_0123456789abcdef";

export function testDeps(baseUrl: string, extra: Partial<ClientOptions> = {}): Deps {
  return {
    client: new BreachsenseClient({ key: TEST_KEY, baseUrl, throttleMs: 0, timeoutMs: 200, sleep: async () => {}, ...extra }),
    keySource: "the BREACHSENSE_API_KEY environment variable",
    secrets: [TEST_KEY],
    store: new ResultStore(),
    costs: new CostTracker(),
    today: () => new Date("2026-11-24T00:00:00Z"),
  };
}

export async function connect(deps: Deps): Promise<Client> {
  const server = createServer(deps);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

export function textOf(res: unknown): string {
  const content = (res as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
}
